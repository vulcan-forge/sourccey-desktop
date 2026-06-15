use crate::modules::control::controllers::remote_control::remote_record_controller::RemoteRecordConfig;
use crate::modules::log::services::command_log_service::CommandLogService;
use crate::services::directory::directory_service::DirectoryService;
use crate::services::log::log_service::LogService;
use crate::services::process::process_service::ProcessService;
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri::Emitter;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const DEFAULT_RECORD_DATASET_FPS: i32 = 30;

pub struct RemoteRecordProcess(
    Arc<Mutex<HashMap<String, (CommandChild, Arc<AtomicBool>, String)>>>,
);

pub struct RemoteRecordService;

impl RemoteRecordService {
    pub fn init_remote_record() -> RemoteRecordProcess {
        RemoteRecordProcess(Arc::new(Mutex::new(HashMap::new())))
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
                match Self::stop_record(
                    &app_handle,
                    db_connection.clone(),
                    state,
                    config.nickname.clone(),
                ) {
                    Ok(_msg) => {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                    }
                    Err(_e) => {}
                }
            }
        }

        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;

        if !lerobot_dir.exists() {
            let message = format!("LeRobot directory not found at: {:?}", lerobot_dir);
            Self::log_record_error(&message);
            return Err(message);
        }

        if !python_path.exists() {
            let message = format!("Python executable not found at: {:?}", python_path);
            Self::log_record_error(&message);
            return Err(message);
        }

        let lerobot_dir_str = lerobot_dir.to_string_lossy().to_string();
        let python_path_str = python_path.to_string_lossy().to_string();
        let command_parts = Self::build_command_args(&config);

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
        Self::emit_record_info(&app_handle, &config.nickname, &start_message);

        let envs = Self::build_envs()?;

        let cmd = app_handle
            .shell()
            .command(python_path_str.clone())
            .args(command_parts[1..].iter())
            .current_dir(lerobot_dir_str.clone())
            .envs(envs);

        let (mut rx, child) = cmd.spawn().map_err(|e| {
            let message = format!(
                "Failed to start record (shell): {}. Python: {}, Working dir: {}",
                e, python_path_str, lerobot_dir_str
            );
            Self::log_record_error(&message);
            message
        })?;

        let shutdown_flag = Arc::new(AtomicBool::new(false));

        let command_string = command_parts.join(" ");
        let command_log_service = CommandLogService::new(db_connection.clone());
        let command_log = match command_log_service
            .add_robot_command_log(
                &command_string,
                Some("sourccey-record".to_string()),
                Some(config.nickname.clone()),
            )
            .await
        {
            Ok(log) => log,
            Err(e) => {
                let message = format!("Failed to add command log: {}", e);
                Self::log_record_error(&message);
                return Err(message);
            }
        };

        let pid = child.pid();
        let command_log_id = command_log.id.clone();
        let nickname_for_logs = config.nickname.clone();
        let app_handle_for_logs = app_handle.clone();
        let shutdown_for_logs = shutdown_flag.clone();
        let record_log_path = Self::record_log_path()
            .ok()
            .map(|p| p.to_string_lossy().to_string());

        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                if shutdown_for_logs.load(Ordering::Relaxed) {
                    break;
                }

                match event {
                    CommandEvent::Stdout(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        let line = line.trim_end();
                        if !line.is_empty() {
                            let formatted = format!("[{}] {}", nickname_for_logs, line);
                            let _ = app_handle_for_logs.emit("record-log", &formatted);
                            if let Some(path) = &record_log_path {
                                LogService::write_log_line(path, Some("record"), line);
                            }
                        }
                    }
                    CommandEvent::Stderr(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        let line = line.trim_end();
                        if !line.is_empty() {
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

            ProcessService::on_process_shutdown(
                app_handle,
                child.pid(),
                db_connection,
                command_log_id,
            );

            if let Err(err) = child.kill() {
                let message = format!("Failed to kill record process: {}", err);
                Self::log_record_error(&message);
            }

            Ok(format!(
                "Record script stop command sent for nickname: {}",
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

    fn build_command_args(config: &RemoteRecordConfig) -> Vec<String> {
        vec![
            "python".to_string(),
            "src/lerobot/scripts/lerobot_record.py".to_string(),
            "--robot.type=sourccey_client".to_string(),
            "--robot.id=sourccey".to_string(),
            format!("--robot.remote_ip={}", config.remote_ip.trim()),
            "--teleop.type=bi_sourccey_leader".to_string(),
            "--teleop.id=sourccey_leader".to_string(),
            format!("--teleop.left_arm_port={}", config.left_arm_port.trim()),
            format!("--teleop.right_arm_port={}", config.right_arm_port.trim()),
            "--teleop_keyboard.type=keyboard".to_string(),
            "--teleop_keyboard.id=sourccey_keyboard".to_string(),
            format!("--dataset.repo_id={}", config.repo_id.trim()),
            format!("--dataset.num_episodes={}", config.num_episodes),
            format!("--dataset.episode_time_s={}", config.episode_time_s),
            format!("--dataset.reset_time_s={}", config.reset_time_s),
            format!("--dataset.single_task={}", config.single_task.trim()),
            format!("--dataset.fps={}", DEFAULT_RECORD_DATASET_FPS),
            "--display_data=true".to_string(),
            "--dataset.push_to_hub=false".to_string(),
        ]
    }

    fn validate_config(config: &RemoteRecordConfig) -> Result<(), String> {
        if config.nickname.trim().is_empty() {
            return Err("Recording requires a robot nickname.".to_string());
        }
        if config.remote_ip.trim().is_empty() {
            return Err("Recording requires a robot host or IP address.".to_string());
        }
        if config.left_arm_port.trim().is_empty() {
            return Err("Recording requires a left arm port.".to_string());
        }
        if config.right_arm_port.trim().is_empty() {
            return Err("Recording requires a right arm port.".to_string());
        }
        if config.keyboard.trim().is_empty() {
            return Err("Recording requires a keyboard or input device.".to_string());
        }
        if config.repo_id.trim().is_empty() {
            return Err("Recording requires a dataset repo ID or path.".to_string());
        }
        if config.num_episodes <= 0 {
            return Err("Recording requires the number of episodes to be greater than 0.".to_string());
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

    fn build_envs() -> Result<HashMap<String, String>, String> {
        let mut envs: HashMap<String, String> = std::env::vars().collect();
        let venv_path = DirectoryService::get_virtual_env_path()?;
        envs.insert(
            "VIRTUAL_ENV".to_string(),
            venv_path.to_string_lossy().to_string(),
        );

        let venv_bin_path = DirectoryService::get_virtual_env_bin_path()?
            .display()
            .to_string();
        let separator = if cfg!(windows) { ";" } else { ":" };
        let base_path = std::env::var("PATH").unwrap_or_default();
        envs.insert(
            "PATH".to_string(),
            format!("{}{}{}", venv_bin_path, separator, base_path),
        );

        envs.insert("DISPLAY".to_string(), ":0".to_string());
        Ok(envs)
    }

    fn log_record_error(message: &str) {
        if let Ok(path) = Self::record_log_path() {
            LogService::write_log_line(path.to_string_lossy().as_ref(), Some("record"), message);
        }
    }

    fn log_record_info(message: &str) {
        if let Ok(path) = Self::record_log_path() {
            LogService::write_log_line(path.to_string_lossy().as_ref(), Some("record"), message);
        }
    }

    fn emit_record_info(app_handle: &AppHandle, nickname: &str, message: &str) {
        let formatted = format!("[{}] {}", nickname, message);
        let _ = app_handle.emit("record-log", &formatted);
    }

    fn record_log_path() -> Result<std::path::PathBuf, String> {
        let base_dir = DirectoryService::get_current_dir()?;
        Ok(base_dir.join("logs").join("record.log"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_config() -> RemoteRecordConfig {
        RemoteRecordConfig {
            nickname: "robot-1".to_string(),
            remote_ip: "192.168.1.100".to_string(),
            left_arm_port: "/dev/ttyACM0".to_string(),
            right_arm_port: "/dev/ttyACM1".to_string(),
            keyboard: "keyboard".to_string(),
            repo_id: "local/robot-1".to_string(),
            num_episodes: 10,
            episode_time_s: 300.0,
            reset_time_s: 5.0,
            single_task: "Fold the shirt".to_string(),
        }
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
    }
}
