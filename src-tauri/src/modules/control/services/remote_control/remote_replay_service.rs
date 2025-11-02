use crate::modules::control::controllers::remote_control::remote_replay_controller::RemoteReplayConfig;
use crate::modules::log::services::command_log_service::CommandLogService;
use crate::services::camera::camera_service::CameraConfig;
use crate::services::directory::directory_service::DirectoryService;
use crate::services::environment::env_service::EnvService;
use crate::services::log::log_service::LogService;
use crate::services::process::process_service::ProcessService;
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Emitter;

// Create a struct to hold our processes and shutdown flags, mapped by nickname
pub struct RemoteReplayProcess(Arc<Mutex<HashMap<String, (Child, Arc<AtomicBool>, String)>>>);

pub struct RemoteReplayService;

impl RemoteReplayService {
    pub fn init_remote_replay() -> RemoteReplayProcess {
        RemoteReplayProcess(Arc::new(Mutex::new(HashMap::new())))
    }

    pub async fn start_replay(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        state: &RemoteReplayProcess,
        config: RemoteReplayConfig,
    ) -> Result<String, String> {
        // Check if a process with this nickname is already running
        {
            let processes = state.0.lock().unwrap();
            if processes.contains_key(&config.nickname) {
                return Err(format!(
                    "Replay process for nickname '{}' is already running",
                    config.nickname
                ));
            }
        }

        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;
        let robot_type = "sourccey".to_string();

        let command_parts = Self::build_command_args(&config);

        // Now build the actual Command
        let mut cmd = Command::new(python_path);
        for arg in &command_parts[1..] {
            cmd.arg(arg);
        }

        // Inherit environment from parent process
        EnvService::add_python_env_vars(&mut cmd)?;

        let mut child = cmd
            .current_dir(&lerobot_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start replay: {}", e))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let shutdown_flag = Arc::new(AtomicBool::new(false));

        // Create command log service with the provided connection
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

        // Get the process ID BEFORE storing the child
        let pid = child.id();
        let command_log_id = command_log.id.clone();

        // Start logging for stdout and stderr
        LogService::start_logger(
            stdout,
            &app_handle,
            &shutdown_flag,
            Some(&config.nickname),
            Some("replay-log"),
            None,
            true,
            false,
        );

        LogService::start_logger(
            stderr,
            &app_handle,
            &shutdown_flag,
            Some(&config.nickname),
            Some("replay-log"),
            None,
            true,
            true,
        );

        // Store the process with its nickname first
        state.0.lock().unwrap().insert(
            config.nickname.clone(),
            (child, shutdown_flag.clone(), command_log_id.clone()),
        );

        // Start process monitoring with built-in delay
        ProcessService::start_process_monitor_with_defaults(
            pid,
            app_handle.clone(),
            state.0.clone(),
            shutdown_flag.clone(),
            config.nickname.clone(),
            "replay-process-shutdown".to_string(),
            serde_json::json!({
                "nickname": config.nickname.clone(),
                "exit_code": None::<i32>,
                "message": "Replay process died unexpectedly"
            }),
            Some(command_log_id),
            Some(db_connection),
        );

        Ok(format!(
            "Local Replay script started successfully for nickname: {}",
            config.nickname
        ))
    }

    pub fn stop_replay(
        db_connection: DatabaseConnection,
        state: &RemoteReplayProcess,
        nickname: String,
    ) -> Result<String, String> {
        if let Some((child, shutdown_flag, command_log_id)) =
            state.0.lock().unwrap().remove(&nickname)
        {
            // Signal threads to stop
            shutdown_flag.store(true, Ordering::Relaxed);

            // Update command log on shutdown
            ProcessService::on_process_shutdown(child.id(), db_connection, command_log_id);

            // Kill the process
            #[cfg(windows)]
            {
                let pid = child.id();
                let _ = Command::new("taskkill")
                    .args(&["/F", "/T", "/PID", &pid.to_string()])
                    .output();
            }

            Ok(format!(
                "Replay script stop command sent for nickname: {}",
                nickname
            ))
        } else {
            Err(format!(
                "No replay process found for nickname: {}",
                nickname
            ))
        }
    }

    /// Build the command arguments for remote replay
    fn build_command_args(config: &RemoteReplayConfig) -> Vec<String> {
        let mut command_parts = vec!["python".to_string()];
        command_parts.push("src/lerobot/control/sourccey/sourccey/replay.py".to_string());
        command_parts.push(format!("--id=\"{}\"", config.nickname));
        command_parts.push(format!("--remote_ip=\"{}\"", config.remote_ip));
        command_parts.push(format!("--dataset.fps={}", config.dataset.fps));
        command_parts.push(format!(
            "--dataset.repo_id=\"{}/{}\"",
            config.nickname, config.dataset.dataset
        ));
        command_parts.push(format!("--dataset.episode={}", config.dataset.episode));

        command_parts
    }
}
