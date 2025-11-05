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
        Self::debug_emit(
            &app_handle,
            &format!("Starting kiosk host for nickname: {}", nickname),
        );

        // Check if a process with this nickname is already running
        Self::debug_emit(&app_handle, "Checking if process already exists...");
        {
            let processes = state.0.lock().unwrap();
            if processes.contains_key(&nickname) {
                Self::debug_emit(&app_handle, "Process already exists, aborting start");

                Ok(format!(
                    "Kiosk host process for nickname '{}' is already running",
                    nickname
                ));
            }
        }
        Self::debug_emit(&app_handle, "No existing process found. Continuing.");

        Self::debug_emit(&app_handle, "Resolving LeRobot directory...");
        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        Self::debug_emit(
            &app_handle,
            &format!("LeRobot directory: {:?}", lerobot_dir),
        );

        Self::debug_emit(&app_handle, "Resolving Python path...");
        let python_path = DirectoryService::get_python_path()?;
        Self::debug_emit(&app_handle, &format!("Python path: {:?}", python_path));

        // Prepare a debug-friendly string before moving/borrowing the path
        let python_path_str = python_path.to_string_lossy().to_string();

        // Use the real host command - use the virtual environment's python directly
        Self::debug_emit(&app_handle, "Preparing host command...");
        let mut command_parts = vec![python_path.to_string_lossy().to_string()];
        command_parts.push("-u".to_string());
        command_parts.push("-m".to_string());
        command_parts.push("lerobot.robots.sourccey.sourccey.sourccey.sourccey_host".to_string());
        Self::debug_emit(&app_handle, &format!("Command: {:?}", command_parts));

        // Log the command for debugging
        println!("Starting kiosk host with command: {:?}", command_parts);
        println!("Working directory: {:?}", lerobot_dir);
        println!("Python path: {}", python_path_str);

        // Create command log entry
        Self::debug_emit(&app_handle, "Creating command log entry...");
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
        Self::debug_emit(
            &app_handle,
            &format!("Command log created with ID: {}", command_log_id),
        );

        // Create the command
        Self::debug_emit(&app_handle, "Creating host process...");
        let mut cmd = Command::new(&command_parts[0]);
        cmd.args(&command_parts[1..])
            .current_dir(&lerobot_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        Self::debug_emit(&app_handle, "Host process configured successfully");

        // Start the process
        Self::debug_emit(&app_handle, "Spawning host process...");
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
        Self::debug_emit(
            &app_handle,
            &format!("Host process started with PID: {}", pid),
        );
        println!("Kiosk host process started with PID: {}", pid);

        // Get stdout and stderr handles
        Self::debug_emit(&app_handle, "Attaching log streams...");
        let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to get stderr")?;
        Self::debug_emit(&app_handle, "Log streams attached");

        // Create shutdown flag
        Self::debug_emit(&app_handle, "Creating shutdown flag...");
        let shutdown_flag = Arc::new(AtomicBool::new(false));

        // Emit success event
        Self::debug_emit(&app_handle, "Emitting start success event...");
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
        Self::debug_emit(&app_handle, "Start success event emitted");

        // Store the process information
        {
            let mut processes = state.0.lock().unwrap();
            processes.insert(
                nickname.clone(),
                (child, shutdown_flag.clone(), command_log_id.clone()),
            );
        }

        // Setup log streaming
        Self::debug_emit(&app_handle, "Starting stdout logger...");
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
        Self::debug_emit(&app_handle, "Stdout logger started");

        Self::debug_emit(&app_handle, "Starting stderr logger...");
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
        Self::debug_emit(&app_handle, "Stderr logger started");

        // Setup process monitoring
        Self::debug_emit(&app_handle, "Starting process monitor...");
        ProcessService::start_process_monitor_with_defaults(
            pid,
            app_handle.clone(),
            state.0.clone(),
            shutdown_flag.clone(),
            nickname.clone(),
            "kiosk-host-process-shutdown".to_string(),
            serde_json::json!({
                "nickname": nickname.clone(),
                "exit_code": None::<i32>,
                "message": "Kiosk host process died unexpectedly"
            }),
            Some(command_log_id),
            Some(db_connection),
        );
        Self::debug_emit(&app_handle, "Process monitor started");
        Self::debug_emit(
            &app_handle,
            "Kiosk host start sequence completed successfully",
        );

        Ok(format!(
            "Kiosk host started successfully for nickname: {}",
            nickname
        ))
    }

    pub fn stop_kiosk_host(
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

            Ok(format!(
                "Kiosk host stopped successfully for nickname: {}",
                nickname
            ))
        } else {
            Err(format!(
                "No kiosk host process found for nickname: {}",
                nickname
            ))
        }
    }

    pub fn is_kiosk_host_active(state: &KioskHostProcess, nickname: String) -> bool {
        let processes = state.0.lock().unwrap();
        processes.contains_key(&nickname)
    }

    pub fn get_active_kiosk_host_sessions(state: &KioskHostProcess) -> Vec<String> {
        let processes = state.0.lock().unwrap();
        processes.keys().cloned().collect()
    }
}
