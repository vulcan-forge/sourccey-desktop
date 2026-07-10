use crate::modules::control::controllers::remote_control::remote_inference_controller::RemoteInferenceConfig;
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

pub struct RemoteInferenceProcess(ManagedRemoteProcesses);

pub struct RemoteInferenceService;

impl RemoteInferenceService {
    pub fn init_remote_inference() -> RemoteInferenceProcess {
        RemoteInferenceProcess(init_managed_processes())
    }

    pub async fn start_inference(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        state: &RemoteInferenceProcess,
        config: RemoteInferenceConfig,
    ) -> Result<String, String> {
        Self::validate_config(&config)?;

        {
            let processes = state.0.lock().unwrap();
            if processes.contains_key(&config.nickname) {
                drop(processes);
                let _ = Self::stop_inference(
                    &app_handle,
                    db_connection.clone(),
                    state,
                    config.nickname.clone(),
                );
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        }

        let runtime = resolve_uv_runtime(&app_handle).map_err(|message| {
            Self::log_inference_error(&message);
            message
        })?;
        let executable = runtime.executable.clone();
        let working_dir = runtime.working_dir.clone();
        let envs = runtime.envs;
        let command_parts = Self::build_command_args(&config);
        let command_display = format_command_for_display(&command_parts);

        let start_message = format!(
            "Starting inference: nickname={}, remote_ip={}, model_path={}, task={}, fps={}, duration={:?}",
            config.nickname,
            config.remote_ip,
            config.model_path,
            config.single_task,
            config.fps,
            config.episode_time_s
        );
        Self::log_inference_info(&start_message);
        Self::log_inference_info(&format!("Command: {}", command_display));
        Self::emit_inference_info(&app_handle, &config.nickname, &start_message);

        let cmd = app_handle
            .shell()
            .command(executable)
            .args(command_parts.iter())
            .current_dir(working_dir.clone())
            .envs(envs);

        let (mut rx, child) = cmd.spawn().map_err(|e| {
            let message = format!(
                "Failed to start inference (shell): {}. Command: {}. Working dir: {}",
                e, command_display, working_dir
            );
            Self::log_inference_error(&message);
            message
        })?;

        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let command_log_id = create_command_log(
            db_connection.clone(),
            &command_display,
            "sourccey-inference",
            &config.nickname,
            "inference",
        )
        .await?;

        let pid = child.pid();
        let nickname_for_logs = config.nickname.clone();
        let app_handle_for_logs = app_handle.clone();
        let shutdown_for_logs = shutdown_flag.clone();
        let inference_log_path = process_log_path("inference")
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
                            let _ = app_handle_for_logs.emit("inference-log", &formatted);
                            if let Some(path) = &inference_log_path {
                                LogService::write_log_line(path, Some("inference"), line);
                            }
                        }
                    }
                    CommandEvent::Stderr(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        let line = line.trim_end();
                        if !line.is_empty() {
                            let formatted = format!("[{}] {}", nickname_for_logs, line);
                            let _ = app_handle_for_logs.emit("inference-log", &formatted);
                            if let Some(path) = &inference_log_path {
                                LogService::write_log_line(path, Some("inference"), line);
                            }
                        }
                    }
                    CommandEvent::Error(err) => {
                        let message = format!("Inference shell error: {}", err);
                        let _ = app_handle_for_logs.emit(
                            "inference-log",
                            &format!("[{}] {}", nickname_for_logs, message),
                        );
                        if let Some(path) = &inference_log_path {
                            LogService::write_log_line(path, Some("inference"), &message);
                        }
                    }
                    CommandEvent::Terminated(payload) => {
                        let message = format!(
                            "Inference process terminated (code={:?}, signal={:?})",
                            payload.code, payload.signal
                        );
                        let _ = app_handle_for_logs.emit(
                            "inference-log",
                            &format!("[{}] {}", nickname_for_logs, message),
                        );
                        if let Some(path) = &inference_log_path {
                            LogService::write_log_line(path, Some("inference"), &message);
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
            "inference-process-shutdown".to_string(),
            serde_json::json!({
                "nickname": config.nickname.clone(),
                "exit_code": None::<i32>,
                "message": "Inference process died unexpectedly"
            }),
            Some(command_log_id),
            Some(db_connection),
        );

        Ok(format!(
            "Inference command started successfully for nickname: {}",
            config.nickname
        ))
    }

    pub fn stop_inference(
        app_handle: &AppHandle,
        db_connection: DatabaseConnection,
        state: &RemoteInferenceProcess,
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
                let message = format!("Failed to kill inference process: {}", err);
                Self::log_inference_error(&message);
            }

            Ok(format!(
                "Inference command stop sent for nickname: {}",
                nickname
            ))
        } else {
            let message = format!(
                "Inference process not found. Stop command sent for nickname: {}",
                nickname
            );
            Self::log_inference_error(&message);
            Ok(message)
        }
    }

    fn build_command_args(config: &RemoteInferenceConfig) -> Vec<String> {
        let mut command_parts = vec!["run".to_string(), "lerobot-inference".to_string()];
        command_parts.push(format!("--id={}", config.nickname.trim()));
        command_parts.push(format!("--remote_ip={}", config.remote_ip.trim()));
        command_parts.push(format!("--model_path={}", config.model_path.trim()));
        command_parts.push(format!("--single_task={}", config.single_task.trim()));
        command_parts.push(format!("--fps={}", config.fps));
        if let Some(episode_time_s) = config.episode_time_s {
            command_parts.push(format!("--episode_time_s={}", episode_time_s));
        }

        command_parts.push(format!("--display_data={}", config.display_data));

        if let Some(display_ip) = &config.display_ip {
            if !display_ip.trim().is_empty() {
                command_parts.push(format!("--display_ip={}", display_ip.trim()));
            }
        }
        if let Some(display_port) = config.display_port {
            command_parts.push(format!("--display_port={}", display_port));
        }
        if config.display_compressed_images {
            command_parts.push("--display_compressed_images=true".to_string());
        }

        command_parts
    }

    fn validate_config(config: &RemoteInferenceConfig) -> Result<(), String> {
        if config.nickname.trim().is_empty() {
            return Err("Inference requires a robot nickname.".to_string());
        }
        if config.remote_ip.trim().is_empty() {
            return Err("Inference requires a robot host or IP address.".to_string());
        }
        if config.model_path.trim().is_empty() {
            return Err("Inference requires a model path.".to_string());
        }
        if config.single_task.trim().is_empty() {
            return Err("Inference requires a task description.".to_string());
        }
        if config.fps <= 0 {
            return Err("Inference requires FPS greater than 0.".to_string());
        }
        if let Some(episode_time_s) = config.episode_time_s {
            if episode_time_s <= 0.0 {
                return Err("Inference duration must be greater than 0 when provided.".to_string());
            }
        }
        if let Some(display_port) = config.display_port {
            if display_port <= 0 {
                return Err(
                    "Inference display port must be greater than 0 when provided.".to_string(),
                );
            }
        }
        Ok(())
    }

    fn log_inference_error(message: &str) {
        write_process_log("inference", message);
    }

    fn log_inference_info(message: &str) {
        write_process_log("inference", message);
    }

    fn emit_inference_info(app_handle: &AppHandle, nickname: &str, message: &str) {
        let formatted = format!("[{}] {}", nickname, message);
        let _ = app_handle.emit("inference-log", &formatted);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_config() -> RemoteInferenceConfig {
        RemoteInferenceConfig {
            nickname: "robot-1".to_string(),
            remote_ip: "192.168.1.100".to_string(),
            model_path: "outputs/train/test/checkpoints/last/pretrained_model".to_string(),
            single_task: "Fold the shirt".to_string(),
            fps: 30,
            episode_time_s: Some(60.0),
            display_data: true,
            display_ip: None,
            display_port: None,
            display_compressed_images: false,
        }
    }

    #[test]
    fn validates_remote_inference_config() {
        assert!(RemoteInferenceService::validate_config(&valid_config()).is_ok());

        let mut invalid_fps = valid_config();
        invalid_fps.fps = 0;
        assert_eq!(
            RemoteInferenceService::validate_config(&invalid_fps),
            Err("Inference requires FPS greater than 0.".to_string())
        );
    }

    #[test]
    fn builds_uv_remote_inference_command() {
        let command_parts = RemoteInferenceService::build_command_args(&valid_config());
        assert_eq!(command_parts[0], "run");
        assert_eq!(command_parts[1], "lerobot-inference");
        assert!(command_parts
            .iter()
            .any(|part| part == "--display_data=true"));
    }
}
