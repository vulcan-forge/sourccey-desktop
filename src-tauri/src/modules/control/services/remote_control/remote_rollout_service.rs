use crate::modules::control::controllers::remote_control::remote_rollout_controller::RemoteRolloutConfig;
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

const DEFAULT_ROLLOUT_FPS: i32 = 30;

pub struct RemoteRolloutProcess(
    Arc<Mutex<HashMap<String, (CommandChild, Arc<AtomicBool>, String)>>>,
);

pub struct RemoteRolloutService;

impl RemoteRolloutService {
    pub fn init_remote_rollout() -> RemoteRolloutProcess {
        RemoteRolloutProcess(Arc::new(Mutex::new(HashMap::new())))
    }

    pub async fn start_rollout(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        state: &RemoteRolloutProcess,
        config: RemoteRolloutConfig,
    ) -> Result<String, String> {
        Self::validate_config(&config)?;

        {
            let processes = state.0.lock().unwrap();
            if processes.contains_key(&config.nickname) {
                drop(processes);
                match Self::stop_rollout(
                    &app_handle,
                    db_connection.clone(),
                    state,
                    config.nickname.clone(),
                ) {
                    Ok(_msg) => std::thread::sleep(std::time::Duration::from_millis(500)),
                    Err(_e) => {}
                }
            }
        }

        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;

        if !lerobot_dir.exists() {
            let message = format!("LeRobot directory not found at: {:?}", lerobot_dir);
            Self::log_rollout_error(&message);
            return Err(message);
        }

        if !python_path.exists() {
            let message = format!("Python executable not found at: {:?}", python_path);
            Self::log_rollout_error(&message);
            return Err(message);
        }

        let lerobot_dir_str = lerobot_dir.to_string_lossy().to_string();
        let python_path_str = python_path.to_string_lossy().to_string();
        let command_parts = Self::build_command_args(&config);

        let start_message = format!(
            "Starting rollout: nickname={}, remote_ip={}, model_path={}, duration={}, task={}",
            config.nickname, config.remote_ip, config.model_path, config.duration, config.task
        );
        Self::log_rollout_info(&start_message);
        Self::emit_rollout_info(&app_handle, &config.nickname, &start_message);

        let envs = Self::build_envs()?;

        let cmd = app_handle
            .shell()
            .command(python_path_str.clone())
            .args(command_parts[1..].iter())
            .current_dir(lerobot_dir_str.clone())
            .envs(envs);

        let (mut rx, child) = cmd.spawn().map_err(|e| {
            let message = format!(
                "Failed to start rollout (shell): {}. Python: {}, Working dir: {}",
                e, python_path_str, lerobot_dir_str
            );
            Self::log_rollout_error(&message);
            message
        })?;

        let shutdown_flag = Arc::new(AtomicBool::new(false));

        let command_string = command_parts.join(" ");
        let command_log_service = CommandLogService::new(db_connection.clone());
        let command_log = match command_log_service
            .add_robot_command_log(
                &command_string,
                Some("sourccey-rollout".to_string()),
                Some(config.nickname.clone()),
            )
            .await
        {
            Ok(log) => log,
            Err(e) => {
                let message = format!("Failed to add command log: {}", e);
                Self::log_rollout_error(&message);
                return Err(message);
            }
        };

        let pid = child.pid();
        let command_log_id = command_log.id.clone();
        let nickname_for_logs = config.nickname.clone();
        let app_handle_for_logs = app_handle.clone();
        let shutdown_for_logs = shutdown_flag.clone();
        let rollout_log_path = Self::rollout_log_path()
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
                            let _ = app_handle_for_logs.emit("rollout-log", &formatted);
                            if let Some(path) = &rollout_log_path {
                                LogService::write_log_line(path, Some("rollout"), line);
                            }
                        }
                    }
                    CommandEvent::Stderr(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        let line = line.trim_end();
                        if !line.is_empty() {
                            let formatted = format!("[{}] {}", nickname_for_logs, line);
                            let _ = app_handle_for_logs.emit("rollout-log", &formatted);
                            if let Some(path) = &rollout_log_path {
                                LogService::write_log_line(path, Some("rollout"), line);
                            }
                        }
                    }
                    CommandEvent::Error(err) => {
                        let message = format!("Rollout shell error: {}", err);
                        let _ = app_handle_for_logs.emit(
                            "rollout-log",
                            &format!("[{}] {}", nickname_for_logs, message),
                        );
                        if let Some(path) = &rollout_log_path {
                            LogService::write_log_line(path, Some("rollout"), &message);
                        }
                    }
                    CommandEvent::Terminated(payload) => {
                        let message = format!(
                            "Rollout process terminated (code={:?}, signal={:?})",
                            payload.code, payload.signal
                        );
                        let _ = app_handle_for_logs.emit(
                            "rollout-log",
                            &format!("[{}] {}", nickname_for_logs, message),
                        );
                        if let Some(path) = &rollout_log_path {
                            LogService::write_log_line(path, Some("rollout"), &message);
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
            "rollout-process-shutdown".to_string(),
            serde_json::json!({
                "nickname": config.nickname.clone(),
                "exit_code": None::<i32>,
                "message": "Rollout process died unexpectedly"
            }),
            Some(command_log_id),
            Some(db_connection),
        );

        Ok(format!(
            "Rollout command started successfully for nickname: {}",
            config.nickname
        ))
    }

    pub fn stop_rollout(
        app_handle: &AppHandle,
        db_connection: DatabaseConnection,
        state: &RemoteRolloutProcess,
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
                let message = format!("Failed to kill rollout process: {}", err);
                Self::log_rollout_error(&message);
            }

            Ok(format!(
                "Rollout stop command sent for nickname: {}",
                nickname
            ))
        } else {
            let message = format!(
                "Rollout process not found. Stop command sent for nickname: {}",
                nickname
            );
            Self::log_rollout_error(&message);
            Ok(message)
        }
    }

    fn build_command_args(config: &RemoteRolloutConfig) -> Vec<String> {
        vec![
            "python".to_string(),
            "src/lerobot/scripts/lerobot_rollout.py".to_string(),
            "--strategy.type=base".to_string(),
            format!("--policy.path={}", config.model_path.trim()),
            "--robot.type=sourccey_client".to_string(),
            format!("--robot.remote_ip={}", config.remote_ip.trim()),
            format!("--task={}", config.task.trim()),
            "--display_data=true".to_string(),
            format!("--duration={}", config.duration),
            format!("--fps={}", DEFAULT_ROLLOUT_FPS),
        ]
    }

    fn validate_config(config: &RemoteRolloutConfig) -> Result<(), String> {
        if config.nickname.trim().is_empty() {
            return Err("Rollout requires a robot nickname.".to_string());
        }
        if config.remote_ip.trim().is_empty() {
            return Err("Rollout requires a robot host or IP address.".to_string());
        }
        if config.model_path.trim().is_empty() {
            return Err("Rollout requires a model path.".to_string());
        }
        if config.task.trim().is_empty() {
            return Err("Rollout requires a task description.".to_string());
        }
        if config.duration <= 0.0 {
            return Err("Rollout duration must be greater than 0.".to_string());
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

    fn log_rollout_error(message: &str) {
        if let Ok(path) = Self::rollout_log_path() {
            LogService::write_log_line(path.to_string_lossy().as_ref(), Some("rollout"), message);
        }
    }

    fn log_rollout_info(message: &str) {
        if let Ok(path) = Self::rollout_log_path() {
            LogService::write_log_line(path.to_string_lossy().as_ref(), Some("rollout"), message);
        }
    }

    fn emit_rollout_info(app_handle: &AppHandle, nickname: &str, message: &str) {
        let formatted = format!("[{}] {}", nickname, message);
        let _ = app_handle.emit("rollout-log", &formatted);
    }

    fn rollout_log_path() -> Result<std::path::PathBuf, String> {
        let base_dir = DirectoryService::get_current_dir()?;
        Ok(base_dir.join("logs").join("rollout.log"))
    }
}
