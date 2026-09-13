use crate::modules::control::controllers::remote_control::remote_replay_controller::{
    RemoteReplayConfig, ReplayDatasetSummary,
};
use crate::modules::control::services::remote_control::remote_command_utils::{
    create_command_log, format_command_for_display, init_managed_processes, process_log_path,
    resolve_uv_runtime, write_process_log, ManagedRemoteProcesses,
};
use crate::services::directory::directory_service::DirectoryService;
use crate::services::log::log_service::LogService;
use crate::services::process::process_service::ProcessService;
use sea_orm::DatabaseConnection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

pub struct RemoteReplayProcess(ManagedRemoteProcesses);

pub struct RemoteReplayService;

impl RemoteReplayService {
    pub fn init_remote_replay() -> RemoteReplayProcess {
        RemoteReplayProcess(init_managed_processes())
    }

    pub fn discover_datasets() -> Result<Vec<ReplayDatasetSummary>, String> {
        const MAX_INFO_BYTES: u64 = 1024 * 1024;

        let namespace = DirectoryService::get_lerobot_cache_dir()?.join("vulcan-studio");
        if !namespace.is_dir() {
            return Ok(Vec::new());
        }

        let mut datasets = Vec::new();
        for entry in std::fs::read_dir(&namespace)
            .map_err(|error| format!("Failed to read local Vulcan Studio datasets: {error}"))?
        {
            let entry =
                entry.map_err(|error| format!("Failed to inspect a local dataset: {error}"))?;
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Failed to inspect a local dataset: {error}"))?;
            if !file_type.is_dir() || file_type.is_symlink() {
                continue;
            }

            let name = entry.file_name().to_string_lossy().trim().to_string();
            if name.is_empty() {
                continue;
            }
            let dataset_path = entry.path();
            let info_path = dataset_path.join("meta").join("info.json");
            let Ok(metadata) = std::fs::symlink_metadata(&info_path) else {
                continue;
            };
            if !metadata.is_file()
                || metadata.file_type().is_symlink()
                || metadata.len() > MAX_INFO_BYTES
            {
                continue;
            }
            let Ok(bytes) = std::fs::read(&info_path) else {
                continue;
            };
            let Ok(info) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
                continue;
            };

            datasets.push(ReplayDatasetSummary {
                repo_id: format!("vulcan-studio/{name}"),
                name,
                path: dataset_path.to_string_lossy().to_string(),
                total_episodes: info
                    .get("total_episodes")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or(0),
                total_frames: info
                    .get("total_frames")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or(0),
            });
        }

        datasets.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
        Ok(datasets)
    }

    pub async fn start_replay(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        state: &RemoteReplayProcess,
        config: RemoteReplayConfig,
    ) -> Result<String, String> {
        Self::validate_config(&config)?;

        {
            let processes = state.0.lock().unwrap();
            if processes.contains_key(&config.nickname) {
                drop(processes);
                let _ = Self::stop_replay(
                    &app_handle,
                    db_connection.clone(),
                    state,
                    config.nickname.clone(),
                );
            }
        }

        let runtime = resolve_uv_runtime(&app_handle).map_err(|message| {
            Self::log_replay_error(&message);
            message
        })?;
        let command_parts = Self::build_command_args(&config);
        let command_display = format_command_for_display(&command_parts);
        let start_message = format!(
            "Starting dataset replay: nickname={}, remote_ip={}, repo_id={}, episode={}, fps={}",
            config.nickname, config.remote_ip, config.repo_id, config.episode, config.fps
        );
        Self::log_replay_info(&start_message);
        Self::log_replay_info(&format!("Command: {}", command_display));
        Self::emit_replay_info(&app_handle, &config.nickname, &start_message);

        let cmd = app_handle
            .shell()
            .command(runtime.executable)
            .args(command_parts.iter())
            .current_dir(runtime.working_dir.clone())
            .envs(runtime.envs)
            .env("PYTHONUNBUFFERED", "1");

        let (mut rx, child) = cmd.spawn().map_err(|error| {
            let message = format!(
                "Failed to start replay: {error}. Command: {command_display}. Working dir: {}",
                runtime.working_dir
            );
            Self::log_replay_error(&message);
            message
        })?;

        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let command_log_id = create_command_log(
            db_connection.clone(),
            &command_display,
            "sourccey-replay",
            &config.nickname,
            "replay",
        )
        .await?;

        let pid = child.pid();
        let nickname_for_logs = config.nickname.clone();
        let app_handle_for_logs = app_handle.clone();
        let state_for_logs = state.0.clone();
        let shutdown_for_logs = shutdown_flag.clone();
        let db_connection_for_logs = db_connection.clone();
        let command_log_id_for_logs = command_log_id.clone();
        let replay_log_path = process_log_path("replay")
            .ok()
            .map(|path| path.to_string_lossy().to_string());

        tauri::async_runtime::spawn(async move {
            let mut replay_started = false;
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line_bytes) | CommandEvent::Stderr(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        let line = line.trim_end();
                        if line.is_empty() {
                            continue;
                        }
                        if !replay_started && line.contains("Replaying episode") {
                            replay_started = true;
                            Self::emit_replay_info(
                                &app_handle_for_logs,
                                &nickname_for_logs,
                                "Replay ready: action loop is running.",
                            );
                        }
                        let formatted = format!("[{}] {}", nickname_for_logs, line);
                        let _ = app_handle_for_logs.emit("replay-log", &formatted);
                        if let Some(path) = &replay_log_path {
                            LogService::write_log_line(path, Some("replay"), line);
                        }
                    }
                    CommandEvent::Error(error) => {
                        let message = format!("Replay shell error: {error}");
                        Self::emit_replay_info(&app_handle_for_logs, &nickname_for_logs, &message);
                        if let Some(path) = &replay_log_path {
                            LogService::write_log_line(path, Some("replay"), &message);
                        }
                    }
                    CommandEvent::Terminated(payload) => {
                        let user_requested_stop = shutdown_for_logs.load(Ordering::Relaxed);
                        let message = format!(
                            "Replay process terminated (code={:?}, signal={:?})",
                            payload.code, payload.signal
                        );
                        Self::emit_replay_info(&app_handle_for_logs, &nickname_for_logs, &message);
                        if let Some(path) = &replay_log_path {
                            LogService::write_log_line(path, Some("replay"), &message);
                        }
                        if !user_requested_stop {
                            shutdown_for_logs.store(true, Ordering::Relaxed);
                            let _ = state_for_logs.lock().unwrap().remove(&nickname_for_logs);
                            ProcessService::on_process_shutdown(
                                &app_handle_for_logs,
                                pid,
                                db_connection_for_logs,
                                command_log_id_for_logs,
                            );
                            let _ = app_handle_for_logs.emit(
                                "replay-process-shutdown",
                                serde_json::json!({
                                    "nickname": nickname_for_logs,
                                    "exit_code": payload.code,
                                    "message": "Replay process completed"
                                }),
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
            shutdown_flag,
            config.nickname.clone(),
            "replay-process-shutdown".to_string(),
            serde_json::json!({
                "nickname": config.nickname.clone(),
                "exit_code": None::<i32>,
                "message": "Replay process exited"
            }),
            Some(command_log_id),
            Some(db_connection),
        );

        Ok(format!(
            "Dataset replay started for nickname: {}",
            config.nickname
        ))
    }

    pub fn stop_replay(
        app_handle: &AppHandle,
        db_connection: DatabaseConnection,
        state: &RemoteReplayProcess,
        nickname: String,
    ) -> Result<String, String> {
        if let Some((child, shutdown_flag, command_log_id)) =
            state.0.lock().unwrap().remove(&nickname)
        {
            shutdown_flag.store(true, Ordering::Relaxed);
            let pid = child.pid();
            ProcessService::on_process_shutdown(app_handle, pid, db_connection, command_log_id);
            Self::emit_replay_info(app_handle, &nickname, "Stopping dataset replay...");

            let graceful_stop_requested = Self::request_graceful_stop(pid);
            let app_handle_for_stop = app_handle.clone();
            std::thread::spawn(move || {
                let grace_period = if graceful_stop_requested { 5 } else { 0 };
                let deadline =
                    std::time::Instant::now() + std::time::Duration::from_secs(grace_period);
                while ProcessService::is_process_alive(&app_handle_for_stop, pid)
                    && std::time::Instant::now() < deadline
                {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }

                if ProcessService::is_process_alive(&app_handle_for_stop, pid) {
                    if let Err(error) = ProcessService::kill_process_tree(&app_handle_for_stop, pid)
                    {
                        Self::log_replay_error(&format!(
                            "Failed to kill replay process tree: {error}"
                        ));
                        let _ = child.kill();
                    }
                }
            });

            Ok(format!(
                "Dataset replay stop requested for nickname: {nickname}"
            ))
        } else {
            Ok(format!("No active dataset replay for nickname: {nickname}"))
        }
    }

    #[cfg(unix)]
    fn request_graceful_stop(pid: u32) -> bool {
        std::process::Command::new("pkill")
            .args(["-INT", "-P", &pid.to_string()])
            .status()
            .is_ok_and(|status| status.success())
    }

    #[cfg(not(unix))]
    fn request_graceful_stop(_pid: u32) -> bool {
        false
    }

    fn build_command_args(config: &RemoteReplayConfig) -> Vec<String> {
        let mut args = vec![
            "run".to_string(),
            "--no-sync".to_string(),
            "lerobot-replay".to_string(),
            "--robot.type=sourccey_client".to_string(),
            "--robot.id=sourccey".to_string(),
            format!("--robot.remote_ip={}", config.remote_ip.trim()),
            format!("--dataset.repo_id={}", config.repo_id.trim()),
            format!("--dataset.episode={}", config.episode),
            format!("--dataset.fps={}", config.fps),
            format!("--play_sounds={}", config.play_sounds),
        ];
        if let Some(root) = config
            .root
            .as_deref()
            .map(str::trim)
            .filter(|root| !root.is_empty())
        {
            args.push(format!("--dataset.root={root}"));
        }
        args
    }

    fn validate_config(config: &RemoteReplayConfig) -> Result<(), String> {
        if config.nickname.trim().is_empty() {
            return Err("Replay requires a robot nickname.".to_string());
        }
        if config.remote_ip.trim().is_empty() {
            return Err("Replay requires a robot host or IP address.".to_string());
        }
        if config.repo_id.trim().is_empty() {
            return Err("Replay requires a dataset ID or path.".to_string());
        }
        if config.episode < 0 {
            return Err("Replay episode must be 0 or greater.".to_string());
        }
        if config.fps <= 0 {
            return Err("Replay FPS must be greater than 0.".to_string());
        }
        Ok(())
    }

    fn emit_replay_info(app_handle: &AppHandle, nickname: &str, message: &str) {
        let _ = app_handle.emit("replay-log", &format!("[{nickname}] {message}"));
    }

    fn log_replay_info(message: &str) {
        write_process_log("replay", message);
    }

    fn log_replay_error(message: &str) {
        write_process_log("replay", message);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_config() -> RemoteReplayConfig {
        RemoteReplayConfig {
            nickname: "robot-1".to_string(),
            remote_ip: "192.168.1.243".to_string(),
            repo_id: "vulcan-studio/sourccey-243".to_string(),
            root: None,
            episode: 0,
            fps: 30,
            play_sounds: false,
        }
    }

    #[test]
    fn validates_replay_config() {
        assert!(RemoteReplayService::validate_config(&valid_config()).is_ok());

        let mut invalid = valid_config();
        invalid.episode = -1;
        assert_eq!(
            RemoteReplayService::validate_config(&invalid),
            Err("Replay episode must be 0 or greater.".to_string())
        );
    }

    #[test]
    fn builds_lerobot_replay_command_with_all_options() {
        let mut config = valid_config();
        config.root = Some("D:/datasets/sourccey".to_string());
        let args = RemoteReplayService::build_command_args(&config);

        assert_eq!(&args[..3], ["run", "--no-sync", "lerobot-replay"]);
        assert!(args.iter().any(|arg| arg == "--robot.type=sourccey_client"));
        assert!(args
            .iter()
            .any(|arg| arg == "--robot.remote_ip=192.168.1.243"));
        assert!(args
            .iter()
            .any(|arg| arg == "--dataset.repo_id=vulcan-studio/sourccey-243"));
        assert!(args.iter().any(|arg| arg == "--dataset.episode=0"));
        assert!(args.iter().any(|arg| arg == "--dataset.fps=30"));
        assert!(args
            .iter()
            .any(|arg| arg == "--dataset.root=D:/datasets/sourccey"));
        assert!(args.iter().any(|arg| arg == "--play_sounds=false"));
    }
}
