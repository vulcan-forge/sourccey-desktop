use crate::modules::control::controllers::remote_control::remote_teleop_controller::RemoteTeleopConfig;
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
use tauri::Manager;

// Create a struct to hold our processes, shutdown flags, and command log info
pub struct RemoteTeleopProcess(Arc<Mutex<HashMap<String, (Child, Arc<AtomicBool>, String)>>>);

pub struct RemoteTeleopService;

impl RemoteTeleopService {
    pub fn init_remote_teleop() -> RemoteTeleopProcess {
        RemoteTeleopProcess(Arc::new(Mutex::new(HashMap::new())))
    }

    pub async fn start_teleop(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        state: &RemoteTeleopProcess,
        config: RemoteTeleopConfig,
    ) -> Result<String, String> {

        println!("Starting remote teleop for nickname: {}", config.nickname);
        // Check if a process with this nickname is already running
        {
            println!("Checking if process already exists");
            let processes = state.0.lock().unwrap();
            println!("Processes: {:?}", processes);
            if processes.contains_key(&config.nickname) {
                // Unlock the mutex before calling stop_teleop (which needs to lock it)
                drop(processes);
                println!("Process already exists for nickname: {}, stopping it first...", config.nickname);
                match Self::stop_teleop(db_connection.clone(), state, config.nickname.clone()) {
                    Ok(msg) => {
                        println!("Stopped existing process: {}", msg);
                        // Give a small delay to ensure the process is fully stopped
                        std::thread::sleep(std::time::Duration::from_millis(500));
                    }
                    Err(e) => {
                        println!("Warning: Failed to stop existing process: {}", e);
                        // Continue anyway - might have already stopped
                    }
                }
            }
        }
        println!("No process found (or stopped) for nickname: {}", config.nickname);

        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        println!("LeRobot directory: {:?}", lerobot_dir);
        let python_path = DirectoryService::get_python_path()?;
        println!("Python path: {:?}", python_path);

        // Validate paths exist before trying to spawn
        if !python_path.exists() {
            println!("Python executable not found at: {:?}", python_path);
            return Err(format!(
                "Python executable not found at: {:?}",
                python_path
            ));
        }

        if !lerobot_dir.exists() {
            println!("LeRobot directory not found at: {:?}", lerobot_dir);
            return Err(format!(
                "LeRobot directory not found at: {:?}",
                lerobot_dir
            ));
        }

        // Verify the script file exists
        let script_path = lerobot_dir.join("src/lerobot/control/sourccey/sourccey/teleoperate.py");
        if !script_path.exists() {
            println!("Teleop script not found at: {:?}", script_path);
            return Err(format!(
                "Teleop script not found at: {:?}",
                script_path
            ));
        }

        // Convert paths to strings for error messages (before moving them)
        let python_path_str = python_path.to_string_lossy().to_string();
        let lerobot_dir_str = lerobot_dir.to_string_lossy().to_string();
        let script_path_str = script_path.to_string_lossy().to_string();

        let robot_type = "sourccey".to_string();

        let command_parts = Self::build_command_args(&config);
        println!("Command parts: {:?}", command_parts);
        // Now build the actual Command
        let mut cmd = Command::new(&python_path);  // Use reference here
        for arg in &command_parts[1..] {
            cmd.arg(arg);
        }

        // Inherit environment from parent process
        EnvService::add_python_env_vars(&mut cmd)?;

        println!("Adding Python environment variables");
        println!("Working directory will be: {:?}", lerobot_dir);
        println!("Script path relative to working dir: {:?}", command_parts[1]);

        let mut child = cmd
            .current_dir(&lerobot_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                format!(
                    "Failed to start teleop: {}. Python: {}, Working dir: {}, Script: {}",
                    e,
                    python_path_str,
                    lerobot_dir_str,
                    script_path_str
                )
            })?;

        println!("Spawning process");
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let shutdown_flag = Arc::new(AtomicBool::new(false));
        println!("Shutdown flag: {:?}", shutdown_flag);

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

        println!("Command log: {:?}", command_log);

        // Store the command log ID for later use
        let pid = child.id();
        let command_log_id = command_log.id.clone();

        // Start logging for stdout and stderr
        LogService::start_logger(
            stdout,
            &app_handle,
            &shutdown_flag,
            Some(&config.nickname),
            Some("teleop-log"),
            None,
            false,
            false,
        );

        LogService::start_logger(
            stderr,
            &app_handle,
            &shutdown_flag,
            Some(&config.nickname),
            Some("teleop-log"),
            None,
            false,
            false,
        );

        // Store the process with its nickname, command log ID, and db connection
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
            "Local Teleop script started successfully for nickname: {}",
            config.nickname
        ))
    }

    pub fn stop_teleop(
        db_connection: DatabaseConnection,
        state: &RemoteTeleopProcess,
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
                "Teleop script stop command sent for nickname: {}",
                nickname
            ))
        } else {
            Err(format!(
                "No teleop process found for nickname: {}",
                nickname
            ))
        }
    }

    /// Build the command arguments for remote teleop
    fn build_command_args(config: &RemoteTeleopConfig) -> Vec<String> {
        let mut command_parts = vec!["python".to_string()];
        command_parts.push("src/lerobot/control/sourccey/sourccey/teleoperate.py".to_string());
        command_parts.push(format!("--id={}", config.nickname));
        command_parts.push(format!("--remote_ip={}", config.remote_ip));
        command_parts.push(format!("--left_arm_port={}", config.left_arm_port));
        command_parts.push(format!("--right_arm_port={}", config.right_arm_port));
        command_parts.push(format!("--keyboard={}", config.keyboard));
        command_parts.push(format!("--fps={}", config.fps));

        command_parts
    }
}
