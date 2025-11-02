use crate::modules::control::controllers::local_control::teleop_controller::TeleopConfig;
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
pub struct TeleopProcess(Arc<Mutex<HashMap<String, (Child, Arc<AtomicBool>, String)>>>);

pub struct TeleopService;

impl TeleopService {
    pub fn init_teleop() -> TeleopProcess {
        TeleopProcess(Arc::new(Mutex::new(HashMap::new())))
    }

    pub async fn start_teleop(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        state: &TeleopProcess,
        config: TeleopConfig,
    ) -> Result<String, String> {
        // Check if a process with this nickname is already running
        {
            let processes = state.0.lock().unwrap();
            if processes.contains_key(&config.nickname) {
                return Err(format!(
                    "Teleop process for nickname '{}' is already running",
                    config.nickname
                ));
            }
        }

        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;
        let robot_type = "so100_follower".to_string();
        let teleop_type = "so100_leader".to_string();

        let command_parts = build_command_parts(&config, &robot_type, &teleop_type);
        let command_parts_for_log = build_command_parts_for_log(&config, &robot_type, &teleop_type);

        // Use command_parts for execution
        let mut cmd = Command::new(python_path);
        for arg in &command_parts[1..] {
            cmd.arg(arg);
        }

        // Add all required environment variables
        EnvService::add_python_env_vars(&mut cmd)?;

        let mut child = cmd
            .current_dir(&lerobot_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start teleop: {}", e))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let shutdown_flag = Arc::new(AtomicBool::new(false));

        // Use command_parts_for_log for database logging
        let command_string = command_parts_for_log.join(" ");
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
            true,
            false,
        );

        LogService::start_logger(
            stderr,
            &app_handle,
            &shutdown_flag,
            Some(&config.nickname),
            Some("teleop-log"),
            None,
            true,
            true,
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
        state: &TeleopProcess,
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

    pub fn is_teleop_active(state: &TeleopProcess, nickname: String) -> bool {
        let processes = state.0.lock().unwrap();
        processes.contains_key(&nickname)
    }

    pub fn get_active_teleop_sessions(state: &TeleopProcess) -> Vec<String> {
        let processes = state.0.lock().unwrap();
        processes.keys().cloned().collect()
    }
}

fn build_command_parts(config: &TeleopConfig, robot_type: &str, teleop_type: &str) -> Vec<String> {
    let mut parts = vec![
        "python".to_string(),
        "src/lerobot/scripts/lerobot_teleoperate.py".to_string(),
    ];

    parts.push(format!("--robot.type={}", robot_type));
    parts.push(format!("--robot.port=\"{}\"", config.robot_port));
    parts.push(format!("--robot.id=\"{}\"", config.nickname));
    parts.push(format!("--teleop.type={}", teleop_type));
    parts.push(format!("--teleop.port=\"{}\"", config.teleop_port));
    parts.push(format!("--teleop.id=\"{}\"", config.nickname));
    parts.push(format!("--display_data=true"));

    if let Some(camera_config) = &config.camera_config {
        let camera_config_str = format!(
            "{{\"{}\": {{\"type\": \"{}\", \"index_or_path\": {}, \"width\": {}, \"height\": {}, \"fps\": {}}}}}",
            camera_config.camera_name,
            camera_config.camera_type,
            camera_config.camera_index,
            camera_config.width,
            camera_config.height,
            camera_config.fps
        );
        parts.push(format!("--robot.cameras={}", camera_config_str));
    }

    parts
}

fn build_command_parts_for_log(
    config: &TeleopConfig,
    robot_type: &str,
    teleop_type: &str,
) -> Vec<String> {
    let mut parts = vec![
        "python".to_string(),
        "src/lerobot/scripts/lerobot_teleoperate.py".to_string(),
    ];

    parts.push(format!("--robot.type={}", robot_type));
    parts.push(format!("--robot.port=\"{}\"", config.robot_port));
    parts.push(format!("--robot.id=\"{}\"", config.nickname));
    parts.push(format!("--teleop.type={}", teleop_type));
    parts.push(format!("--teleop.port=\"{}\"", config.teleop_port));
    parts.push(format!("--teleop.id=\"{}\"", config.nickname));
    parts.push(format!("--display_data=true"));

    if let Some(camera_config) = &config.camera_config {
        let camera_config_str = format!(
            "{{ '{}': {{ 'type': '{}', 'index_or_path': {}, 'width': {}, 'height': {}, 'fps': {}}}}}",
            camera_config.camera_name,
            camera_config.camera_type,
            camera_config.camera_index,
            camera_config.width,
            camera_config.height,
            camera_config.fps
        );
        parts.push(format!("--robot.cameras=\"{}\"", camera_config_str)); // Quoted for logging
    }

    parts
}
