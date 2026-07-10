use crate::modules::control::controllers::remote_control::remote_teleop_controller::RemoteTeleopConfig;
use crate::modules::control::services::remote_control::remote_command_utils::{
    create_command_log, format_command_for_display, init_managed_processes, process_log_path,
    resolve_uv_runtime, write_process_log, ManagedRemoteProcesses,
};
use crate::services::log::log_service::LogService;
use crate::services::process::process_service::ProcessService;
use sea_orm::DatabaseConnection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::{fs, path::PathBuf};
use tauri::AppHandle;
use tauri::Emitter;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

pub struct RemoteTeleopProcess(ManagedRemoteProcesses);

pub struct RemoteTeleopService;

impl RemoteTeleopService {
    pub fn keyboard_state_path(nickname: &str) -> PathBuf {
        let safe_nickname: String = nickname
            .chars()
            .map(|character| {
                if character.is_ascii_alphanumeric() {
                    character
                } else {
                    '_'
                }
            })
            .collect();
        std::env::temp_dir().join(format!("sourccey-keyboard-{safe_nickname}.json"))
    }

    pub fn update_keyboard_state(nickname: &str, keys: &[String]) -> Result<(), String> {
        let path = Self::keyboard_state_path(nickname);
        let contents = serde_json::to_vec(keys)
            .map_err(|error| format!("Failed to encode keyboard state: {error}"))?;
        fs::write(&path, contents).map_err(|error| {
            format!(
                "Failed to update keyboard state at {}: {error}",
                path.display()
            )
        })
    }

    pub fn init_remote_teleop() -> RemoteTeleopProcess {
        RemoteTeleopProcess(init_managed_processes())
    }

    pub async fn start_teleop(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        state: &RemoteTeleopProcess,
        config: RemoteTeleopConfig,
    ) -> Result<String, String> {
        Self::validate_config(&config)?;

        {
            let processes = state.0.lock().unwrap();
            if processes.contains_key(&config.nickname) {
                drop(processes);
                let _ = Self::stop_teleop(
                    &app_handle,
                    db_connection.clone(),
                    state,
                    config.nickname.clone(),
                );
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        }

        let runtime = resolve_uv_runtime(&app_handle).map_err(|message| {
            Self::log_teleop_error(&message);
            message
        })?;
        let executable = runtime.executable.clone();
        let working_dir = runtime.working_dir.clone();
        let envs = runtime.envs;
        Self::update_keyboard_state(&config.nickname, &[])?;
        let command_parts = Self::build_command_args(&config);
        let command_display = format_command_for_display(&command_parts);

        let start_message = format!(
            "Starting remote teleop: nickname={}, remote_ip={}, left_arm_port={}, right_arm_port={}, keyboard={}, fps={}",
            config.nickname,
            config.remote_ip,
            config.left_arm_port,
            config.right_arm_port,
            config.keyboard,
            config.fps
        );
        Self::log_teleop_info(&start_message);
        Self::log_teleop_info(&format!("Command: {}", command_display));
        Self::emit_teleop_info(&app_handle, &config.nickname, &start_message);
        Self::emit_teleop_info(
            &app_handle,
            &config.nickname,
            &format!("Command: {}", command_display),
        );

        let cmd = app_handle
            .shell()
            .command(executable)
            .args(command_parts.iter())
            .current_dir(working_dir.clone())
            .envs(envs);

        let (mut rx, child) = cmd.spawn().map_err(|e| {
            let message = format!(
                "Failed to start teleop (shell): {}. Command: {}. Working dir: {}",
                e, command_display, working_dir
            );
            Self::log_teleop_error(&message);
            message
        })?;

        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let command_log_id = create_command_log(
            db_connection.clone(),
            &command_display,
            "sourccey",
            &config.nickname,
            "teleop",
        )
        .await?;

        let pid = child.pid();
        let nickname_for_logs = config.nickname.clone();
        let app_handle_for_logs = app_handle.clone();
        let shutdown_for_logs = shutdown_flag.clone();
        let teleop_log_path = process_log_path("teleop")
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
                            let _ = app_handle_for_logs.emit("teleop-log", &formatted);
                            if let Some(path) = &teleop_log_path {
                                LogService::write_log_line(path, Some("teleop"), line);
                            }
                        }
                    }
                    CommandEvent::Stderr(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        let line = line.trim_end();
                        if !line.is_empty() {
                            let formatted = format!("[{}] {}", nickname_for_logs, line);
                            let _ = app_handle_for_logs.emit("teleop-log", &formatted);
                            if let Some(path) = &teleop_log_path {
                                LogService::write_log_line(path, Some("teleop"), line);
                            }
                        }
                    }
                    CommandEvent::Error(err) => {
                        let message = format!("Teleop shell error: {}", err);
                        let _ = app_handle_for_logs.emit(
                            "teleop-log",
                            &format!("[{}] {}", nickname_for_logs, message),
                        );
                        if let Some(path) = &teleop_log_path {
                            LogService::write_log_line(path, Some("teleop"), &message);
                        }
                    }
                    CommandEvent::Terminated(payload) => {
                        let message = format!(
                            "Teleop process terminated (code={:?}, signal={:?})",
                            payload.code, payload.signal
                        );
                        let _ = app_handle_for_logs.emit(
                            "teleop-log",
                            &format!("[{}] {}", nickname_for_logs, message),
                        );
                        if let Some(path) = &teleop_log_path {
                            LogService::write_log_line(path, Some("teleop"), &message);
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
            "teleop-process-shutdown".to_string(),
            serde_json::json!({
                "nickname": config.nickname.clone(),
                "exit_code": None::<i32>,
                "message": "Teleop process died unexpectedly"
            }),
            Some(command_log_id),
            Some(db_connection),
        );

        Ok(format!(
            "Remote teleop command started successfully for nickname: {}",
            config.nickname
        ))
    }

    pub fn stop_teleop(
        app_handle: &AppHandle,
        db_connection: DatabaseConnection,
        state: &RemoteTeleopProcess,
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

            if let Err(err) = ProcessService::kill_process_tree(app_handle, child.pid()) {
                let message = format!("Failed to kill teleop process tree: {}", err);
                Self::log_teleop_error(&message);
            }
            let _ = fs::remove_file(Self::keyboard_state_path(&nickname));

            Ok(format!(
                "Teleop command stop sent for nickname: {}",
                nickname
            ))
        } else {
            let message = format!(
                "Teleop process not found. Stop command sent for nickname: {}",
                nickname
            );
            Self::log_teleop_error(&message);
            Ok(message)
        }
    }

    fn build_command_args(config: &RemoteTeleopConfig) -> Vec<String> {
        let mut args = vec![
            "run".to_string(),
            "lerobot-teleoperate".to_string(),
            "--robot.type=sourccey_client".to_string(),
            "--robot.id=sourccey".to_string(),
            format!("--robot.remote_ip={}", config.remote_ip.trim()),
            "--teleop.type=bi_sourccey_leader".to_string(),
            "--teleop.id=sourccey_leader".to_string(),
            format!("--teleop.left_arm_port={}", config.left_arm_port.trim()),
            format!("--teleop.right_arm_port={}", config.right_arm_port.trim()),
            "--teleop_keyboard.type=keyboard".to_string(),
            format!("--teleop_keyboard.id={}", config.keyboard.trim()),
        ];
        if cfg!(target_os = "macos") {
            args.push(format!(
                "--teleop_keyboard.input_state_path={}",
                Self::keyboard_state_path(&config.nickname).display()
            ));
        }
        args.extend([
            format!("--fps={}", config.fps),
            "--display_data=false".to_string(),
        ]);
        args
    }

    fn validate_config(config: &RemoteTeleopConfig) -> Result<(), String> {
        if config.nickname.trim().is_empty() {
            return Err("Teleoperation requires a robot nickname.".to_string());
        }
        if config.remote_ip.trim().is_empty() {
            return Err("Teleoperation requires a robot host or IP address.".to_string());
        }
        if config.keyboard.trim().is_empty() {
            return Err("Teleoperation requires a keyboard or input device.".to_string());
        }
        if config.fps <= 0 {
            return Err("Teleoperation requires FPS greater than 0.".to_string());
        }
        Ok(())
    }

    fn log_teleop_error(message: &str) {
        write_process_log("teleop", message);
    }

    fn log_teleop_info(message: &str) {
        write_process_log("teleop", message);
    }

    fn emit_teleop_info(app_handle: &AppHandle, nickname: &str, message: &str) {
        let formatted = format!("[{}] {}", nickname, message);
        let _ = app_handle.emit("teleop-log", &formatted);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_config() -> RemoteTeleopConfig {
        RemoteTeleopConfig {
            nickname: "robot-1".to_string(),
            remote_ip: "192.168.1.100".to_string(),
            left_arm_port: "COM3".to_string(),
            right_arm_port: "COM4".to_string(),
            keyboard: "keyboard".to_string(),
            fps: 30,
        }
    }

    #[test]
    fn validates_remote_teleop_start_config() {
        assert!(RemoteTeleopService::validate_config(&valid_config()).is_ok());

        let mut missing_host = valid_config();
        missing_host.remote_ip = "   ".to_string();
        assert_eq!(
            RemoteTeleopService::validate_config(&missing_host),
            Err("Teleoperation requires a robot host or IP address.".to_string())
        );

        let mut invalid_fps = valid_config();
        invalid_fps.fps = 0;
        assert_eq!(
            RemoteTeleopService::validate_config(&invalid_fps),
            Err("Teleoperation requires FPS greater than 0.".to_string())
        );
    }

    #[test]
    fn builds_uv_remote_teleop_command() {
        let command_parts = RemoteTeleopService::build_command_args(&valid_config());
        assert_eq!(command_parts[0], "run");
        assert_eq!(command_parts[1], "lerobot-teleoperate");
        assert!(command_parts
            .iter()
            .any(|part| part == "--robot.type=sourccey_client"));
        assert!(command_parts
            .iter()
            .any(|part| part == "--teleop_keyboard.id=keyboard"));
        assert!(command_parts
            .iter()
            .any(|part| part == "--display_data=false"));
    }
}
