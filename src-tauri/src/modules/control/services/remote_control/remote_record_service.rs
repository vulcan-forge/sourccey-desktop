use crate::modules::control::controllers::remote_control::remote_record_controller::{
    RemoteRecordConfig, VrRecordSettings,
};
use crate::modules::control::services::remote_control::remote_command_utils::{
    create_command_log, format_command_for_display, init_managed_processes, process_log_path,
    resolve_uv_runtime, write_process_log, ManagedRemoteProcesses,
};
use crate::modules::control::services::remote_control::remote_teleop_service::RemoteTeleopService;
#[cfg(feature = "desktop")]
use crate::modules::dataset_sync::services::upload_service::UploadService;
use crate::services::environment::build_service::BuildService;
use crate::services::log::log_service::LogService;
use crate::services::process::process_service::ProcessService;
use sea_orm::DatabaseConnection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

const DEFAULT_RECORD_DATASET_FPS: i32 = 30;

pub struct RemoteRecordProcess(ManagedRemoteProcesses);

pub struct RemoteRecordService;

impl RemoteRecordService {
    pub fn init_remote_record() -> RemoteRecordProcess {
        RemoteRecordProcess(init_managed_processes())
    }

    #[cfg(feature = "desktop")]
    fn sync_completed_dataset(
        app_handle: AppHandle,
        connection: DatabaseConnection,
        nickname: String,
        robot_id: String,
        repo_id: String,
    ) {
        tauri::async_runtime::spawn(async move {
            match UploadService::queue_completed_dataset_metadata(&connection, &robot_id, &repo_id)
                .await
            {
                Ok(queued) => {
                    Self::emit_record_info(
                        &app_handle,
                        &nickname,
                        &format!(
                            "Completed dataset metadata queued for sync: {}",
                            queued.object_key
                        ),
                    );
                    if let Err(error) =
                        UploadService::transmit_queued_metadata(&connection, 20).await
                    {
                        Self::emit_record_info(
                            &app_handle,
                            &nickname,
                            &format!("Dataset metadata remains queued: {error}"),
                        );
                    }
                }
                Err(error) => Self::emit_record_info(
                    &app_handle,
                    &nickname,
                    &format!("Completed dataset was not queued: {error}"),
                ),
            }
        });
    }

    pub async fn start_record(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        state: &RemoteRecordProcess,
        config: RemoteRecordConfig,
    ) -> Result<String, String> {
        Self::validate_config(&config)?;

        {
            let processes = state.0.lock().unwrap();
            if processes.contains_key(&config.nickname) {
                drop(processes);
                let _ = Self::stop_record(
                    &app_handle,
                    db_connection.clone(),
                    state,
                    config.nickname.clone(),
                );
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        }

        let runtime = resolve_uv_runtime(&app_handle).map_err(|message| {
            Self::log_record_error(&message);
            message
        })?;
        let executable = runtime.executable.clone();
        let working_dir = runtime.working_dir.clone();
        let envs = runtime.envs;
        RemoteTeleopService::update_keyboard_state(&config.nickname, &[])?;
        if config.vr_headset {
            // Opening the connection starts teleoperation. Capture is a separate action.
            let _ = std::fs::remove_file(Self::vr_start_signal_path(&config.nickname));
            let _ = std::fs::remove_file(Self::vr_stop_signal_path(&config.nickname));
            let _ = std::fs::remove_file(Self::vr_ready_signal_path(&config.nickname));
            Self::write_vr_settings(
                &config.nickname,
                Some(&VrRecordSettings {
                    repo_id: config.repo_id.clone(),
                    name_pattern: config.name_pattern.clone(),
                    num_episodes: config.num_episodes,
                    episode_time_s: config.episode_time_s,
                    reset_time_s: config.reset_time_s,
                    single_task: config.single_task.clone(),
                }),
            )?;
        }
        let runner_name = if config.vr_headset {
            "runner.py"
        } else {
            "standard_runner.py"
        };
        let runner_path = if BuildService::is_dev_mode() {
            crate::services::directory::directory_service::DirectoryService::get_current_dir()?
                .join("scripts")
                .join("vr_recording")
                .join(runner_name)
        } else {
            app_handle
                .path()
                .resolve(
                    format!("scripts/vr_recording/{runner_name}"),
                    tauri::path::BaseDirectory::Resource,
                )
                .map_err(|error| format!("Could not resolve the recording adapter: {error}"))?
        };
        if !runner_path.is_file() {
            return Err(format!(
                "The desktop recording adapter was not found at {}.",
                runner_path.display()
            ));
        }
        let command_parts = Self::build_command_args(&config, &runner_path);
        let command_display = format_command_for_display(&command_parts);

        let start_message = format!(
            "Starting remote record: nickname={}, remote_ip={}, repo_id={}, num_episodes={}, episode_time_s={}, reset_time_s={}",
            config.nickname,
            config.remote_ip,
            config.repo_id,
            config.num_episodes,
            config.episode_time_s,
            config.reset_time_s
        );
        Self::log_record_info(&start_message);
        Self::log_record_info(&format!("Command: {}", command_display));
        Self::emit_record_info(&app_handle, &config.nickname, &start_message);

        let cmd = app_handle
            .shell()
            .command(executable)
            .args(command_parts.iter())
            .current_dir(working_dir.clone())
            .envs(envs)
            .env("PYTHONUNBUFFERED", "1")
            .env("SOURCCEY_RECORD_NAME_PATTERN", &config.name_pattern);

        let (mut rx, child) = cmd.spawn().map_err(|e| {
            if config.vr_headset {
                let _ = std::fs::remove_file(Self::vr_start_signal_path(&config.nickname));
                let _ = std::fs::remove_file(Self::vr_ready_signal_path(&config.nickname));
            }
            let message = format!(
                "Failed to start record (shell): {}. Command: {}. Working dir: {}",
                e, command_display, working_dir
            );
            Self::log_record_error(&message);
            message
        })?;

        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let command_log_id = create_command_log(
            db_connection.clone(),
            &command_display,
            "lerobot-record",
            &config.nickname,
            "record",
        )
        .await?;

        let pid = child.pid();
        let nickname_for_logs = config.nickname.clone();
        let vr_headset_for_logs = config.vr_headset;
        #[cfg(feature = "desktop")]
        let robot_id_for_sync = config.robot_id.clone();
        #[cfg(feature = "desktop")]
        let repo_id_for_sync = config.repo_id.clone();
        #[cfg(feature = "desktop")]
        let db_connection_for_sync = db_connection.clone();
        let app_handle_for_logs = app_handle.clone();
        let record_log_path = process_log_path("record")
            .ok()
            .map(|p| p.to_string_lossy().to_string());

        tauri::async_runtime::spawn(async move {
            let mut capture_started = false;
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        let line = line.trim_end();
                        if !line.is_empty() {
                            if !capture_started
                                && (if vr_headset_for_logs {
                                    line.starts_with("VR capture started: ")
                                } else {
                                    line.contains("Recording episode")
                                })
                            {
                                capture_started = true;
                                Self::emit_record_info(
                                    &app_handle_for_logs,
                                    &nickname_for_logs,
                                    "Recording ready: capture loop is running.",
                                );
                            }
                            let formatted = format!("[{}] {}", nickname_for_logs, line);
                            let _ = app_handle_for_logs.emit("record-log", &formatted);
                            if let Some(path) = &record_log_path {
                                LogService::write_log_line(path, Some("record"), line);
                            }
                            #[cfg(feature = "desktop")]
                            if let Some(repo_id) = line.strip_prefix("VR capture saved: ") {
                                capture_started = false;
                                Self::sync_completed_dataset(
                                    app_handle_for_logs.clone(),
                                    db_connection_for_sync.clone(),
                                    nickname_for_logs.clone(),
                                    robot_id_for_sync.clone(),
                                    repo_id.to_string(),
                                );
                            }
                        }
                    }
                    CommandEvent::Stderr(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        let line = line.trim_end();
                        if !line.is_empty() {
                            if !capture_started
                                && (if vr_headset_for_logs {
                                    line.starts_with("VR capture started: ")
                                } else {
                                    line.contains("Recording episode")
                                })
                            {
                                capture_started = true;
                                Self::emit_record_info(
                                    &app_handle_for_logs,
                                    &nickname_for_logs,
                                    "Recording ready: capture loop is running.",
                                );
                            }
                            let formatted = format!("[{}] {}", nickname_for_logs, line);
                            let _ = app_handle_for_logs.emit("record-log", &formatted);
                            if let Some(path) = &record_log_path {
                                LogService::write_log_line(path, Some("record"), line);
                            }
                        }
                    }
                    CommandEvent::Error(err) => {
                        let message = format!("Record shell error: {}", err);
                        let _ = app_handle_for_logs.emit(
                            "record-log",
                            &format!("[{}] {}", nickname_for_logs, message),
                        );
                        if let Some(path) = &record_log_path {
                            LogService::write_log_line(path, Some("record"), &message);
                        }
                    }
                    CommandEvent::Terminated(payload) => {
                        #[cfg(feature = "desktop")]
                        let completed_successfully =
                            !vr_headset_for_logs && capture_started && payload.code == Some(0);
                        let message = format!(
                            "Record process terminated (code={:?}, signal={:?})",
                            payload.code, payload.signal
                        );
                        let _ = app_handle_for_logs.emit(
                            "record-log",
                            &format!("[{}] {}", nickname_for_logs, message),
                        );
                        if let Some(path) = &record_log_path {
                            LogService::write_log_line(path, Some("record"), &message);
                        }
                        #[cfg(feature = "desktop")]
                        if completed_successfully {
                            Self::sync_completed_dataset(
                                app_handle_for_logs.clone(),
                                db_connection_for_sync.clone(),
                                nickname_for_logs.clone(),
                                robot_id_for_sync.clone(),
                                repo_id_for_sync.clone(),
                            );
                        }
                        break;
                    }
                    _ => {}
                }
            }
        });

        state.0.lock().unwrap().insert(
            config.nickname.clone(),
            (child, shutdown_flag.clone(), command_log_id.clone()),
        );

        ProcessService::start_process_monitor_with_defaults(
            pid,
            app_handle.clone(),
            state.0.clone(),
            shutdown_flag.clone(),
            config.nickname.clone(),
            "record-process-shutdown".to_string(),
            serde_json::json!({
                "nickname": config.nickname.clone(),
                "exit_code": None::<i32>,
                "message": "Record process died unexpectedly"
            }),
            Some(command_log_id),
            Some(db_connection),
        );

        Ok(format!(
            "Recording command started successfully for nickname: {}",
            config.nickname
        ))
    }

    pub fn stop_record(
        app_handle: &AppHandle,
        db_connection: DatabaseConnection,
        state: &RemoteRecordProcess,
        nickname: String,
    ) -> Result<String, String> {
        if let Some((child, shutdown_flag, command_log_id)) =
            state.0.lock().unwrap().remove(&nickname)
        {
            shutdown_flag.store(true, Ordering::Relaxed);

            let pid = child.pid();
            let _ = std::fs::remove_file(Self::vr_start_signal_path(&nickname));
            let _ = std::fs::remove_file(Self::vr_stop_signal_path(&nickname));
            let _ = std::fs::remove_file(Self::vr_ready_signal_path(&nickname));
            let _ = std::fs::remove_file(Self::vr_task_path(&nickname));

            ProcessService::on_process_shutdown(app_handle, pid, db_connection, command_log_id);

            Self::emit_record_info(
                app_handle,
                &nickname,
                "Closing recording connection and finalizing any captured data...",
            );

            // The recorder already treats an Escape key edge as a graceful stop.
            // Send that through the focused keyboard bridge so its control loop
            // stops immediately and its existing finally block can save the
            // episode, finalize video, and disconnect the robot.
            let graceful_stop_requested = match RemoteTeleopService::update_keyboard_state(
                &nickname,
                &["escape".to_string()],
            ) {
                Ok(()) => true,
                Err(err) => {
                    let message = format!("Failed to request graceful recording stop: {}", err);
                    Self::log_record_error(&message);
                    false
                }
            };

            // Keep ownership of the wrapper while Python finalizes. If the
            // graceful stop is not honored, terminate the complete uv/Python
            // process tree instead of killing only uv and orphaning Python.
            let app_handle_for_stop = app_handle.clone();
            let nickname_for_stop = nickname.clone();
            std::thread::spawn(move || {
                let grace_period = if graceful_stop_requested { 30 } else { 0 };
                let deadline =
                    std::time::Instant::now() + std::time::Duration::from_secs(grace_period);
                while ProcessService::is_process_alive(&app_handle_for_stop, pid)
                    && std::time::Instant::now() < deadline
                {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }

                if ProcessService::is_process_alive(&app_handle_for_stop, pid) {
                    Self::log_record_error(
                        "Recording did not finish finalizing within 30 seconds; forcing its process tree to stop.",
                    );
                    if let Err(err) = ProcessService::kill_process_tree(&app_handle_for_stop, pid) {
                        Self::log_record_error(&format!(
                            "Failed to kill record process tree: {}",
                            err
                        ));
                        let _ = child.kill();
                    }
                }

                let _ = std::fs::remove_file(RemoteTeleopService::keyboard_state_path(
                    &nickname_for_stop,
                ));
                Self::emit_record_info(
                    &app_handle_for_stop,
                    &nickname_for_stop,
                    "Recording connection closed; any captured data is finalized.",
                );
                let _ = app_handle_for_stop.emit(
                    "record-process-finalized",
                    serde_json::json!({ "nickname": nickname_for_stop }),
                );
            });

            Ok(format!(
                "Record command stop requested for nickname: {}",
                nickname
            ))
        } else {
            let message = format!(
                "Record process not found. Stop command sent for nickname: {}",
                nickname
            );
            Self::log_record_error(&message);
            Ok(message)
        }
    }

    fn vr_start_signal_path(nickname: &str) -> std::path::PathBuf {
        RemoteTeleopService::keyboard_state_path(nickname).with_extension("vr-start")
    }

    fn vr_stop_signal_path(nickname: &str) -> std::path::PathBuf {
        RemoteTeleopService::keyboard_state_path(nickname).with_extension("vr-stop")
    }

    fn vr_task_path(nickname: &str) -> std::path::PathBuf {
        RemoteTeleopService::keyboard_state_path(nickname).with_extension("vr-task")
    }

    fn vr_ready_signal_path(nickname: &str) -> std::path::PathBuf {
        RemoteTeleopService::keyboard_state_path(nickname).with_extension("vr-ready")
    }

    fn write_vr_settings(
        nickname: &str,
        settings: Option<&VrRecordSettings>,
    ) -> Result<(), String> {
        let path = Self::vr_task_path(nickname);
        let pending = path.with_extension("vr-task.pending");
        let validation = settings.map_or(Ok(()), VrRecordSettings::validate);
        // An invalid draft must replace the previous valid settings, so headset
        // Start cannot silently reuse a stale task or episode count.
        let payload = match settings {
            Some(settings) if validation.is_ok() => serde_json::to_vec(settings),
            _ => serde_json::to_vec(&serde_json::json!({ "valid": false })),
        }
        .map_err(|error| error.to_string())?;
        std::fs::write(&pending, payload)
            .map_err(|error| format!("Could not write VR recording settings: {error}"))?;
        std::fs::rename(&pending, &path)
            .map_err(|error| format!("Could not activate VR recording settings: {error}"))?;
        validation
    }

    pub fn update_vr_record_settings(
        state: &RemoteRecordProcess,
        nickname: &str,
        settings: Option<&VrRecordSettings>,
    ) -> Result<(), String> {
        let processes = state.0.lock().unwrap();
        if !processes.contains_key(nickname) {
            return Err("Open the recording teleoperation connection first.".to_string());
        }
        Self::write_vr_settings(nickname, settings)
    }

    pub fn begin_vr_record(
        state: &RemoteRecordProcess,
        nickname: &str,
        settings: &VrRecordSettings,
        requested_at_ms: Option<u64>,
    ) -> Result<(), String> {
        settings.validate()?;
        if !Self::vr_ready_signal_path(nickname).is_file() {
            return Err(
                "Recording is still saving or waiting for live headset controls.".to_string(),
            );
        }
        Self::update_vr_record_settings(state, nickname, Some(settings))?;
        // Snapshot all settings so later edits only affect the next batch.
        let start_path = Self::vr_start_signal_path(nickname);
        let pending_path = start_path.with_extension("vr-start.pending");
        std::fs::write(
            &pending_path,
            serde_json::to_vec(settings).map_err(|error| error.to_string())?,
        )
        .map_err(|error| format!("Could not signal VR recording start: {error}"))?;
        std::fs::rename(&pending_path, &start_path)
            .map_err(|error| format!("Could not activate VR recording start: {error}"))?;
        let ui_wait_ms = requested_at_ms.and_then(|requested| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|now| now.as_millis().saturating_sub(u128::from(requested)))
        });
        write_process_log(
            "record",
            &format!(
                "VR desktop start signal written (UI wait: {} ms)",
                ui_wait_ms.map_or("unknown".to_string(), |wait| wait.to_string())
            ),
        );
        let _ = std::fs::remove_file(Self::vr_ready_signal_path(nickname));
        Ok(())
    }

    pub fn stop_vr_capture(state: &RemoteRecordProcess, nickname: &str) -> Result<(), String> {
        if !state.0.lock().unwrap().contains_key(nickname) {
            return Err("Open the recording teleoperation connection first.".to_string());
        }
        std::fs::write(Self::vr_stop_signal_path(nickname), b"stop")
            .map_err(|error| format!("Could not signal VR recording stop: {error}"))
    }

    fn build_command_args(
        config: &RemoteRecordConfig,
        runner_path: &std::path::Path,
    ) -> Vec<String> {
        let mut args = if config.vr_headset {
            vec![
                "run".to_string(),
                "--no-sync".to_string(),
                "python".to_string(),
                runner_path.to_string_lossy().to_string(),
                "--robot.id=sourccey".to_string(),
                format!("--robot.remote_ip={}", config.remote_ip.trim()),
            ]
        } else {
            vec![
                "run".to_string(),
                "--no-sync".to_string(),
                "python".to_string(),
                runner_path.to_string_lossy().to_string(),
                "--robot.type=sourccey_client".to_string(),
                "--robot.id=sourccey".to_string(),
                format!("--robot.remote_ip={}", config.remote_ip.trim()),
                "--teleop.type=bi_sourccey_leader".to_string(),
                "--teleop.id=sourccey_leader".to_string(),
                format!("--teleop.left_arm_port={}", config.left_arm_port.trim()),
                format!("--teleop.right_arm_port={}", config.right_arm_port.trim()),
                "--teleop_keyboard.type=keyboard".to_string(),
                format!("--teleop_keyboard.id={}", config.keyboard.trim()),
                format!("--desktop_name_pattern={}", config.name_pattern.trim()),
            ]
        };
        if config.vr_headset {
            args.push(format!(
                "--vr_start_signal_path={}",
                Self::vr_start_signal_path(&config.nickname).display()
            ));
            args.push(format!(
                "--vr_stop_signal_path={}",
                Self::vr_stop_signal_path(&config.nickname).display()
            ));
            args.push(format!(
                "--vr_task_path={}",
                Self::vr_task_path(&config.nickname).display()
            ));
            args.push(format!(
                "--vr_ready_signal_path={}",
                Self::vr_ready_signal_path(&config.nickname).display()
            ));
            args.push(format!(
                "--teleop_keyboard.input_state_path={}",
                RemoteTeleopService::keyboard_state_path(&config.nickname).display()
            ));
        } else {
            args.push(format!(
                "--teleop_keyboard.input_state_path={}",
                RemoteTeleopService::keyboard_state_path(&config.nickname).display()
            ));
        }
        args.extend([
            format!("--dataset.repo_id={}", config.repo_id.trim()),
            format!("--dataset.num_episodes={}", config.num_episodes),
            format!("--dataset.episode_time_s={}", config.episode_time_s),
            format!("--dataset.reset_time_s={}", config.reset_time_s),
            format!("--dataset.single_task={}", config.single_task.trim()),
            format!("--dataset.fps={}", DEFAULT_RECORD_DATASET_FPS),
            format!("--display_data={}", config.display_data),
            "--dataset.push_to_hub=false".to_string(),
        ]);
        args
    }

    fn validate_config(config: &RemoteRecordConfig) -> Result<(), String> {
        if config.robot_id.trim().is_empty() {
            return Err("Recording requires a stable robot ID.".to_string());
        }
        if config.nickname.trim().is_empty() {
            return Err("Recording requires a robot nickname.".to_string());
        }
        if config.remote_ip.trim().is_empty() {
            return Err("Recording requires a robot host or IP address.".to_string());
        }
        if config.keyboard.trim().is_empty() {
            return Err("Recording requires a keyboard or input device.".to_string());
        }
        if config.repo_id.trim().is_empty() {
            return Err("Recording requires a dataset repo ID or path.".to_string());
        }
        if config.num_episodes <= 0 {
            return Err(
                "Recording requires the number of episodes to be greater than 0.".to_string(),
            );
        }
        if config.episode_time_s <= 0.0 {
            return Err("Recording requires episode time to be greater than 0.".to_string());
        }
        if config.reset_time_s < 0.0 {
            return Err("Recording requires reset time to be 0 or greater.".to_string());
        }
        if config.single_task.trim().is_empty() {
            return Err("Recording requires a task description.".to_string());
        }
        Ok(())
    }

    fn log_record_error(message: &str) {
        write_process_log("record", message);
    }

    fn log_record_info(message: &str) {
        write_process_log("record", message);
    }

    fn emit_record_info(app_handle: &AppHandle, nickname: &str, message: &str) {
        let formatted = format!("[{}] {}", nickname, message);
        let _ = app_handle.emit("record-log", &formatted);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_config() -> RemoteRecordConfig {
        RemoteRecordConfig {
            robot_id: "robot-id-1".to_string(),
            nickname: "robot-1".to_string(),
            remote_ip: "192.168.1.100".to_string(),
            left_arm_port: "/dev/ttyACM0".to_string(),
            right_arm_port: "/dev/ttyACM1".to_string(),
            keyboard: "keyboard".to_string(),
            repo_id: "local/robot-1".to_string(),
            name_pattern: "Sourccey-{Task}-{number}-{timestamp}".to_string(),
            num_episodes: 10,
            episode_time_s: 300.0,
            reset_time_s: 5.0,
            single_task: "Fold the shirt".to_string(),
            vr_headset: false,
            display_data: false,
        }
    }

    #[test]
    fn invalid_draft_replaces_previously_valid_settings() {
        let nickname = format!(
            "invalid-draft-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let path = RemoteRecordService::vr_task_path(&nickname);
        let mut settings = VrRecordSettings {
            repo_id: "local/test".to_string(),
            name_pattern: "Demo-{Task}-{number}-{timestamp}".to_string(),
            num_episodes: 3,
            episode_time_s: 30.0,
            reset_time_s: 15.0,
            single_task: "Fold the shirt".to_string(),
        };
        RemoteRecordService::write_vr_settings(&nickname, Some(&settings)).unwrap();
        let payload: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(payload["num_episodes"], 3);

        RemoteRecordService::write_vr_settings(&nickname, None).unwrap();
        let payload: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(payload, serde_json::json!({ "valid": false }));

        RemoteRecordService::write_vr_settings(&nickname, Some(&settings)).unwrap();
        settings.num_episodes = 0;
        assert!(RemoteRecordService::write_vr_settings(&nickname, Some(&settings)).is_err());
        let payload: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(payload, serde_json::json!({ "valid": false }));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn validates_remote_record_config() {
        assert!(RemoteRecordService::validate_config(&valid_config()).is_ok());

        let mut missing_repo = valid_config();
        missing_repo.repo_id = "   ".to_string();
        assert_eq!(
            RemoteRecordService::validate_config(&missing_repo),
            Err("Recording requires a dataset repo ID or path.".to_string())
        );

        let mut invalid_episode_count = valid_config();
        invalid_episode_count.num_episodes = 0;
        assert_eq!(
            RemoteRecordService::validate_config(&invalid_episode_count),
            Err("Recording requires the number of episodes to be greater than 0.".to_string())
        );

        let mut missing_ports = valid_config();
        missing_ports.left_arm_port = "   ".to_string();
        missing_ports.right_arm_port = "".to_string();
        assert!(RemoteRecordService::validate_config(&missing_ports).is_ok());
    }

    #[test]
    fn builds_uv_remote_record_command() {
        let normal_runner =
            std::path::Path::new("C:/Vulcan Studio/scripts/vr_recording/standard_runner.py");
        let command_parts = RemoteRecordService::build_command_args(&valid_config(), normal_runner);
        assert_eq!(command_parts[0], "run");
        assert_eq!(command_parts[1], "--no-sync");
        assert_eq!(command_parts[2], "python");
        assert!(command_parts[3].ends_with("scripts/vr_recording/standard_runner.py"));
        assert!(command_parts
            .iter()
            .any(|part| { part == "--desktop_name_pattern=Sourccey-{Task}-{number}-{timestamp}" }));
        assert!(command_parts
            .iter()
            .any(|part| part == "--teleop.type=bi_sourccey_leader"));
        assert!(command_parts.iter().any(|part| {
            part.starts_with("--teleop_keyboard.input_state_path=")
                && part.ends_with("sourccey-keyboard-robot_1.json")
        }));
        assert!(command_parts
            .iter()
            .any(|part| part == "--dataset.push_to_hub=false"));
        assert!(command_parts
            .iter()
            .any(|part| part == "--display_data=false"));

        let mut display_config = valid_config();
        display_config.display_data = true;
        assert!(
            RemoteRecordService::build_command_args(&display_config, normal_runner)
                .iter()
                .any(|part| part == "--display_data=true")
        );

        let mut vr_config = valid_config();
        vr_config.vr_headset = true;
        let vr_runner = std::path::Path::new("C:/Vulcan Studio/scripts/vr_recording/runner.py");
        let vr_args = RemoteRecordService::build_command_args(&vr_config, vr_runner);
        assert!(vr_args
            .iter()
            .any(|part| part.ends_with("scripts/vr_recording/runner.py")));
        assert!(!vr_args.iter().any(|part| part == "lerobot-record"));
        assert!(vr_args
            .iter()
            .any(|part| part.starts_with("--teleop_keyboard.input_state_path=")));
        assert!(!vr_args
            .iter()
            .any(|part| part.starts_with("--teleop.input_state_path=")));
        assert!(vr_args
            .iter()
            .any(|part| part.starts_with("--vr_start_signal_path=")));
        assert!(vr_args
            .iter()
            .any(|part| part.starts_with("--vr_task_path=")));
        assert!(vr_args
            .iter()
            .any(|part| part.starts_with("--vr_ready_signal_path=")));
        assert!(!vr_args
            .iter()
            .any(|part| part.starts_with("--teleop.left_arm_port=")));
    }
}
