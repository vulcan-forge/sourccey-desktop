use crate::modules::log::services::command_log_service::CommandLogService;
use crate::services::directory::directory_service::DirectoryService;
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
pub struct KioskHostProcess(Arc<Mutex<HashMap<String, (Child, Arc<AtomicBool>, String)>>>);

pub struct KioskHostService;

impl KioskHostService {
    pub fn init_kiosk_host() -> KioskHostProcess {
        KioskHostProcess(Arc::new(Mutex::new(HashMap::new())))
    }

    // Helper to emit messages to both console and frontend
    fn debug_emit(app_handle: &AppHandle, message: &str) {
        println!("{}", message);
        if let Err(e) = app_handle.emit("kiosk-host-log", message) {
            println!("Failed to emit kiosk message: {}", e);
        }
    }

    pub async fn start_kiosk_host(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        state: &KioskHostProcess,
        nickname: String,
    ) -> Result<String, String> {

        // Check if a process with this nickname is already running
        {
            let processes = state.0.lock().unwrap();
            if processes.contains_key(&nickname) {
                Self::debug_emit(&app_handle, "Process already exists, aborting start");

                return Ok(format!(
                    "Kiosk host process for nickname '{}' is already running",
                    nickname
                ));
            }
        }
        
        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;

        // Prepare a debug-friendly string before moving/borrowing the path
        let python_path_str = python_path.to_string_lossy().to_string();

        // Use the real host command - use the virtual environment's python directly
        let mut command_parts = vec![python_path.to_string_lossy().to_string()];
        command_parts.push("-u".to_string());
        command_parts.push("-m".to_string());
        command_parts.push("lerobot.robots.sourccey.sourccey.sourccey.sourccey_host".to_string());

        let command_log_service = CommandLogService::new(db_connection.clone());
        let command_log = command_log_service
            .add_robot_command_log(
                &format!("Starting kiosk host: {}", command_parts.join(" ")),
                Some("sourccey".to_string()),
                Some(nickname.clone()),
            )
            .await
            .map_err(|e| {
                Self::debug_emit(&app_handle, &format!("Command log creation failed: {}", e));
                format!("Failed to create command log: {}", e)
            })?;
        let command_log_id = command_log.id;

        // Create the command
        let mut cmd = Command::new(&command_parts[0]);
        cmd.args(&command_parts[1..])
            .current_dir(&lerobot_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Start the process
        let mut child = cmd.spawn()
            .map_err(|e| {
                let error_msg = format!(
                    "Failed to start kiosk host process: {}. Command: {:?}, Working dir: {:?}, Python path: {}",
                    e, command_parts, lerobot_dir, python_path_str
                );
                Self::debug_emit(&app_handle, &format!("Failed to spawn host process: {}", error_msg));
                error_msg
            })?;

        let pid = child.id();

        // Get stdout and stderr handles
        let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

        // Create shutdown flag
        let shutdown_flag = Arc::new(AtomicBool::new(false));

        // Emit success event
        app_handle
            .emit(
                "kiosk-host-start-success",
                serde_json::json!({
                    "nickname": nickname,
                    "pid": pid,
                    "message": "Kiosk host started successfully"
                }),
            )
            .map_err(|e| {
                Self::debug_emit(&app_handle, &format!("Failed to emit success event: {}", e));
                format!("Failed to emit success event: {}", e)
            })?;

        // Store the process information
        {
            let mut processes = state.0.lock().unwrap();
            processes.insert(
                nickname.clone(),
                (child, shutdown_flag.clone(), command_log_id.clone()),
            );
        }

        // Setup log streaming
        LogService::start_logger(
            Some(stdout),
            &app_handle,
            &shutdown_flag,
            Some(&format!("[{}] HOST", nickname)),
            Some("kiosk-host-log"),
            None,
            true,
            false,
        );

        LogService::start_logger(
            Some(stderr),
            &app_handle,
            &shutdown_flag,
            Some(&format!("[{}] HOST-ERR", nickname)),
            Some("kiosk-host-log"),
            None,
            true,
            true,
        );

        // Setup process monitoring
        ProcessService::start_process_monitor_with_defaults(
            pid,
            app_handle.clone(),
            state.0.clone(),
            shutdown_flag.clone(),
            nickname.clone(),
            "kiosk-host-stop-success".to_string(),
            serde_json::json!({
                "nickname": nickname.clone(),
                "exit_code": None::<i32>,
                "message": "Robot process died unexpectedly"
            }),
            Some(command_log_id),
            Some(db_connection),
        );

        Ok(format!(
            "Robot starting for nickname: {}",
            nickname
        ))
    }

    pub fn stop_kiosk_host(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        state: &KioskHostProcess,
        nickname: String,
    ) -> Result<String, String> {
        if let Some((mut child, shutdown_flag, command_log_id)) =
            state.0.lock().unwrap().remove(&nickname)
        {
            // Get PID before doing anything else
            let pid = child.id();

            // Signal threads to stop
            shutdown_flag.store(true, Ordering::Relaxed);

            // Update command log on shutdown
            ProcessService::on_process_shutdown(pid, db_connection, command_log_id);

            // Try graceful termination first
            println!(
                "Attempting graceful termination of kiosk host process PID: {}",
                pid
            );

            // Send SIGTERM for graceful shutdown
            #[cfg(unix)]
            {
                let _ = Command::new("kill")
                    .args(&["-TERM", &pid.to_string()])
                    .output();
            }

            #[cfg(windows)]
            {
                let _ = Command::new("taskkill")
                    .args(&["/T", "/PID", &pid.to_string()])
                    .output();
            }

            // Wait for a short time for graceful shutdown
            std::thread::sleep(std::time::Duration::from_secs(2));

            // Force kill if still running
            if let Err(_) = child.try_wait() {
                println!("Force killing kiosk host process PID: {}", pid);
                let _ = child.kill();
            }

            #[cfg(windows)]
            {
                let _ = Command::new("taskkill")
                    .args(&["/F", "/T", "/PID", &pid.to_string()])
                    .output();
            }

            // Emit stop success event
            let _ = app_handle.emit(
                "kiosk-host-stop-success",
                serde_json::json!({
                    "nickname": nickname,
                    "pid": pid,
                    "exit_code": None::<i32>,
                    "message": "Robot stopped successfully"
                }),
            );

            Ok(format!(
                "Robot stopping for nickname: {}",
                nickname
            ))
        } else {
            // Emit stop error event
            let _ = app_handle.emit(
                "kiosk-host-stop-error",
                serde_json::json!({
                    "nickname": nickname,
                    "error": format!("No kiosk host process found for nickname: {}", nickname),
                }),
            );

            Err(format!(
                "No kiosk host process found for nickname: {}",
                nickname
            ))
        }
    }

    pub fn is_kiosk_host_active(state: &KioskHostProcess, nickname: String) -> bool {
        // 1) Managed by this app
        if state.0.lock().unwrap().contains_key(&nickname) {
            return true;
        }
    
        // 2) Externally started (Linux): check for the module name in cmdline
        // Use a specific match to avoid false positives.
        // Example: the module you spawn contains "sourccey_host"
        let status = Command::new("pgrep")
            .args(&["-f", "sourccey_host"])
            .status();
    
        status.map(|s| s.success()).unwrap_or(false)
    }
}
