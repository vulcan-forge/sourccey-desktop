use crate::modules::control::controllers::remote_control::remote_inference_controller::RemoteInferenceConfig;
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

pub struct RemoteInferenceProcess(Arc<Mutex<HashMap<String, (CommandChild, Arc<AtomicBool>, String)>>>);

pub struct RemoteInferenceService;

impl RemoteInferenceService {
    pub fn init_remote_inference() -> RemoteInferenceProcess {
        RemoteInferenceProcess(Arc::new(Mutex::new(HashMap::new())))
    }

    pub async fn start_inference(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        state: &RemoteInferenceProcess,
        config: RemoteInferenceConfig,
    ) -> Result<String, String> {
        {
            let processes = state.0.lock().unwrap();
            if processes.contains_key(&config.nickname) {
                drop(processes);
                println!(
                    "Process already exists for nickname: {}, stopping it first...",
                    config.nickname
                );
                match Self::stop_inference(&app_handle, db_connection.clone(), state, config.nickname.clone()) {
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
            return Err(format!(
                "LeRobot directory not found at: {:?}",
                lerobot_dir
            ));
        }

        if !python_path.exists() {
            return Err(format!(
                "Python executable not found at: {:?}",
                python_path
            ));
        }

        let lerobot_dir_str = lerobot_dir.to_string_lossy().to_string();
        let python_path_str = python_path.to_string_lossy().to_string();

        let robot_type = "sourccey".to_string();
        let command_parts = Self::build_command_args(&config);
        let envs = Self::build_envs()?;

        let cmd = app_handle
            .shell()
            .command(python_path_str.clone())
            .args(command_parts[1..].iter())
            .current_dir(lerobot_dir_str.clone())
            .envs(envs);

        let (mut rx, child) = cmd.spawn().map_err(|e| {
            format!(
                "Failed to start inference (shell): {}. Python: {}, Working dir: {}",
                e, python_path_str, lerobot_dir_str
            )
        })?;

        let shutdown_flag = Arc::new(AtomicBool::new(false));

        let command_string = command_parts.join(" ");
        let command_log_service = CommandLogService::new(db_connection.clone());
        let command_log = match command_log_service
            .add_robot_command_log(
                &command_string,
                Some(robot_type),
                Some(config.nickname.clone()),
            )
            .await
        {
            Ok(log) => log,
            Err(e) => {
                eprintln!("Failed to add command log: {}", e);
                return Err(format!("Failed to add command log: {}", e));
            }
        };

        let pid = child.pid();
        let command_log_id = command_log.id.clone();

        let nickname_for_logs = config.nickname.clone();
        let app_handle_for_logs = app_handle.clone();
        let shutdown_for_logs = shutdown_flag.clone();

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
                        }
                    }
                    CommandEvent::Stderr(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        let line = line.trim_end();
                        if !line.is_empty() {
                            let formatted = format!("[{}] {}", nickname_for_logs, line);
                            let _ = app_handle_for_logs.emit("inference-log", &formatted);
                        }
                    }
                    CommandEvent::Error(err) => {
                        let message = format!("Inference shell error: {}", err);
                        let _ = app_handle_for_logs.emit(
                            "inference-log",
                            &format!("[{}] {}", nickname_for_logs, message),
                        );
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
            "Inference script started successfully for nickname: {}",
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

            ProcessService::on_process_shutdown(app_handle, child.pid(), db_connection, command_log_id);

            if let Err(err) = child.kill() {
                let message = format!("Failed to kill inference process: {}", err);
                LogService::write_log_line("inference.log", Some("inference"), &message);
            }

            Ok(format!(
                "Inference script stop command sent for nickname: {}",
                nickname
            ))
        } else {
            Err(format!(
                "No inference process found for nickname: {}",
                nickname
            ))
        }
    }

    fn build_command_args(config: &RemoteInferenceConfig) -> Vec<String> {
        let mut command_parts = vec!["python".to_string()];
        command_parts.push("src/lerobot/control/sourccey/sourccey/inference.py".to_string());
        command_parts.push(format!("--id={}", config.nickname));
        command_parts.push(format!("--remote_ip={}", config.remote_ip));
        command_parts.push(format!("--model_path={}", config.model_path));
        command_parts.push(format!("--single_task={}", config.single_task));
        command_parts.push(format!("--fps={}", config.fps));
        if let Some(episode_time_s) = config.episode_time_s {
            command_parts.push(format!("--episode_time_s={}", episode_time_s));
        }

        command_parts.push(format!("--display_data={}", config.display_data));

        if let Some(display_ip) = &config.display_ip {
            if !display_ip.is_empty() {
                command_parts.push(format!("--display_ip={}", display_ip));
            }
        }
        if let Some(display_port) = &config.display_port {
            command_parts.push(format!("--display_port={}", display_port));
        }
        if config.display_compressed_images {
            command_parts.push("--display_compressed_images=true".to_string());
        }

        command_parts
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
}
