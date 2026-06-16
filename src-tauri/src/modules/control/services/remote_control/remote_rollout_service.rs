use crate::modules::control::controllers::remote_control::remote_rollout_controller::RemoteRolloutConfig;
use crate::modules::control::services::remote_control::remote_command_utils::{
    create_command_log, format_command_for_display, init_managed_processes, process_log_path,
    resolve_uv_runtime, write_process_log, ManagedRemoteProcesses,
};
use crate::services::log::log_service::LogService;
use crate::services::process::process_service::ProcessService;
use sea_orm::DatabaseConnection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

const DEFAULT_ROLLOUT_FPS: i32 = 30;

pub struct RemoteRolloutProcess(ManagedRemoteProcesses);

pub struct RemoteRolloutService;

impl RemoteRolloutService {
    pub fn init_remote_rollout() -> RemoteRolloutProcess {
        RemoteRolloutProcess(init_managed_processes())
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
                let _ = Self::stop_rollout(
                    &app_handle,
                    db_connection.clone(),
                    state,
                    config.nickname.clone(),
                );
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        }

        let runtime = resolve_uv_runtime(&app_handle).map_err(|message| {
            Self::log_rollout_error(&message);
            message
        })?;
        let executable = runtime.executable.clone();
        let working_dir = runtime.working_dir.clone();
        let envs = runtime.envs;
        let command_parts = Self::build_command_args(&config);
        let command_display = format_command_for_display(&command_parts);

        let start_message = format!(
            "Starting rollout: nickname={}, remote_ip={}, model_path={}, duration={}, task={}",
            config.nickname, config.remote_ip, config.model_path, config.duration, config.task
        );
        Self::log_rollout_info(&start_message);
        Self::log_rollout_info(&format!("Command: {}", command_display));
        Self::emit_rollout_info(&app_handle, &config.nickname, &start_message);

        let cmd = app_handle
            .shell()
            .command(executable)
            .args(command_parts.iter())
            .current_dir(working_dir.clone())
            .envs(envs);

        let (mut rx, child) = cmd.spawn().map_err(|e| {
            let message = format!(
                "Failed to start rollout (shell): {}. Command: {}. Working dir: {}",
                e, command_display, working_dir
            );
            Self::log_rollout_error(&message);
            message
        })?;

        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let command_log_id = create_command_log(
            db_connection.clone(),
            &command_display,
            "sourccey-rollout",
            &config.nickname,
            "rollout",
        )
        .await?;

        let pid = child.pid();
        let nickname_for_logs = config.nickname.clone();
        let app_handle_for_logs = app_handle.clone();
        let shutdown_for_logs = shutdown_flag.clone();
        let rollout_log_path = process_log_path("rollout")
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
                "Rollout command stop sent for nickname: {}",
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
            "run".to_string(),
            "lerobot-rollout".to_string(),
            "--strategy.type=base".to_string(),
            format!("--policy.path={}", config.model_path.trim()),
            "--robot.type=sourccey_client".to_string(),
            "--robot.id=sourccey".to_string(),
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

    fn log_rollout_error(message: &str) {
        write_process_log("rollout", message);
    }

    fn log_rollout_info(message: &str) {
        write_process_log("rollout", message);
    }

    fn emit_rollout_info(app_handle: &AppHandle, nickname: &str, message: &str) {
        let formatted = format!("[{}] {}", nickname, message);
        let _ = app_handle.emit("rollout-log", &formatted);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_config() -> RemoteRolloutConfig {
        RemoteRolloutConfig {
            nickname: "robot-1".to_string(),
            remote_ip: "192.168.1.100".to_string(),
            model_path: "outputs/train/test/checkpoints/last/pretrained_model".to_string(),
            task: "Fold the shirt".to_string(),
            duration: 300.0,
        }
    }

    #[test]
    fn validates_remote_rollout_config() {
        assert!(RemoteRolloutService::validate_config(&valid_config()).is_ok());

        let mut invalid_duration = valid_config();
        invalid_duration.duration = 0.0;
        assert_eq!(
            RemoteRolloutService::validate_config(&invalid_duration),
            Err("Rollout duration must be greater than 0.".to_string())
        );
    }

    #[test]
    fn builds_uv_remote_rollout_command() {
        let command_parts = RemoteRolloutService::build_command_args(&valid_config());
        assert_eq!(command_parts[0], "run");
        assert_eq!(command_parts[1], "lerobot-rollout");
        assert!(
            command_parts
                .iter()
                .any(|part| part == "--strategy.type=base")
        );
    }
}
