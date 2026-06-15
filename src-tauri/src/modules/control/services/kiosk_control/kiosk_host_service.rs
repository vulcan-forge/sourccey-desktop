use crate::modules::control::services::kiosk_control::pairing_service::KioskPairingService;
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
#[derive(Clone)]
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
        // Launch from the prepared virtualenv directly so host start does not
        // depend on parsing uv.lock at runtime.
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
        let envs = Self::build_envs()?;
        Self::debug_emit(
            &app_handle,
            &format!("Launching kiosk host command: {}", command_parts.join(" ")),
        );
        if let Some(credentials_path) = envs.get("VULCAN_DEVICE_CREDENTIALS_PATH") {
            Self::debug_emit(
                &app_handle,
                &format!(
                    "Using cloud device credentials at {} (exists={})",
                    credentials_path,
                    std::path::Path::new(credentials_path).exists()
                ),
            );
        }
        cmd.args(&command_parts[1..])
            .current_dir(&lerobot_dir)
            .envs(envs)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Start the process
        let mut child = cmd.spawn().map_err(|e| {
            let error_msg = format!(
                "Failed to start kiosk host process: {}. Command: {:?}, Working dir: {:?}",
                e, command_parts, lerobot_dir
            );
            Self::debug_emit(
                &app_handle,
                &format!("Failed to spawn host process: {}", error_msg),
            );
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

        Ok(format!("Robot starting for nickname: {}", nickname))
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
            println!("Stopping kiosk host process for nickname: {}", nickname);

            // Get PID before doing anything else
            let pid = child.id();

            // Signal threads to stop
            shutdown_flag.store(true, Ordering::Relaxed);

            // Update command log on shutdown
            ProcessService::on_process_shutdown(&app_handle, pid, db_connection, command_log_id);

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

            // Wait for a short time for graceful shutdown
            std::thread::sleep(std::time::Duration::from_secs(2));

            // Force kill if still running
            if let Err(_) = child.try_wait() {
                println!("Force killing kiosk host process PID: {}", pid);
                let _ = child.kill();
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

            Ok(format!("Robot stopping for nickname: {}", nickname))
        } else {
            println!(
                "Checking for external sourccey_host process for nickname: {}",
                nickname
            );
            // Fallback: not tracked in state, but may be running externally on Linux.
            // Find all matching PIDs (command line contains "sourccey_host")
            let output = Command::new("pgrep")
                .args(&["-f", "sourccey_host"])
                .output()
                .map_err(|e| format!("Failed to run pgrep: {}", e))?;

            let stdout = String::from_utf8_lossy(&output.stdout);
            let pids: Vec<u32> = stdout
                .lines()
                .filter_map(|line| line.trim().parse::<u32>().ok())
                .collect();

            if pids.is_empty() {
                // Emit stop error event (nothing to stop)
                let _ = app_handle.emit(
                    "kiosk-host-stop-error",
                    serde_json::json!({
                        "nickname": nickname,
                        "error": format!("No kiosk host process found for nickname: {} (and no external sourccey_host found)", nickname),
                    }),
                );

                return Err(format!(
                    "No kiosk host process found for nickname: {}",
                    nickname
                ));
            }

            // Try graceful stop first, then force
            for pid in &pids {
                let _ = Command::new("kill")
                    .args(&["-TERM", &pid.to_string()])
                    .output();
            }

            std::thread::sleep(std::time::Duration::from_secs(1));

            // Force kill any that remain
            for pid in &pids {
                let _ = Command::new("kill")
                    .args(&["-KILL", &pid.to_string()])
                    .output();
            }

            // Emit stop success (we attempted to stop external processes)
            let _ = app_handle.emit(
                "kiosk-host-stop-success",
                serde_json::json!({
                    "nickname": nickname,
                    "pid": pids.first().copied(), // one pid for convenience
                    "exit_code": None::<i32>,
                    "message": format!("Stopped external sourccey_host process(es): {:?}", pids),
                }),
            );

            Ok(format!(
                "Stopped external sourccey_host process(es) for nickname: {}",
                nickname
            ))
        }
    }

    pub fn is_kiosk_host_active(state: &KioskHostProcess, nickname: String) -> bool {
        // 1) Managed by this app
        if state.0.lock().unwrap().contains_key(&nickname) {
            return true;
        }

        Self::has_external_kiosk_host_process()
    }

    pub fn is_any_kiosk_host_active(state: &KioskHostProcess) -> bool {
        if !state.0.lock().unwrap().is_empty() {
            return true;
        }

        Self::has_external_kiosk_host_process()
    }

    fn build_envs() -> Result<HashMap<String, String>, String> {
        let mut envs: HashMap<String, String> = std::env::vars().collect();
        let venv_path = DirectoryService::get_virtual_env_path()?;
        let lerobot_src_path = DirectoryService::get_lerobot_vulcan_dir()?.join("src");
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

        let lerobot_src = lerobot_src_path.to_string_lossy().to_string();
        let base_python_path = std::env::var("PYTHONPATH").unwrap_or_default();
        let python_path = if base_python_path.is_empty() {
            lerobot_src
        } else {
            format!("{}{}{}", lerobot_src, separator, base_python_path)
        };
        envs.insert("PYTHONPATH".to_string(), python_path);

        let cloud_credentials_path = Self::cloud_device_credentials_path()?;
        let cloud_credentials_path = cloud_credentials_path.to_string_lossy().to_string();
        envs.insert(
            "VULCAN_DEVICE_CREDENTIALS_PATH".to_string(),
            cloud_credentials_path.clone(),
        );
        envs.insert(
            "SOURCCEY_CLOUD_CREDENTIALS_PATH".to_string(),
            cloud_credentials_path,
        );

        if cfg!(target_os = "linux") {
            envs.entry("DISPLAY".to_string())
                .or_insert_with(|| ":0".to_string());
        }

        Ok(envs)
    }

    fn cloud_device_credentials_path() -> Result<std::path::PathBuf, String> {
        KioskPairingService::current_cloud_device_credentials_file_path()
    }

    fn has_external_kiosk_host_process() -> bool {
        // Externally started (Linux): check for the module name in cmdline.
        let status = Command::new("pgrep")
            .args(["-f", "sourccey_host"])
            .status();

        status.map(|s| s.success()).unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::KioskHostService;
    use std::process::{Child, Command};
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    #[test]
    fn empty_kiosk_host_state_reports_inactive() {
        let state = KioskHostService::init_kiosk_host();
        assert!(!KioskHostService::is_any_kiosk_host_active(&state));
    }

    #[test]
    fn populated_kiosk_host_state_reports_active() {
        let state = KioskHostService::init_kiosk_host();
        let child = spawn_test_process();

        state.0.lock().unwrap().insert(
            "sourccey".to_string(),
            (child, Arc::new(AtomicBool::new(false)), "test-log".to_string()),
        );

        assert!(KioskHostService::is_any_kiosk_host_active(&state));

        let removed = { state.0.lock().unwrap().remove("sourccey") };
        if let Some((mut child, _, _)) = removed {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    #[cfg(windows)]
    fn spawn_test_process() -> Child {
        Command::new("cmd")
            .args(["/C", "ping", "127.0.0.1", "-n", "5"])
            .spawn()
            .expect("test process should spawn")
    }

    #[cfg(not(windows))]
    fn spawn_test_process() -> Child {
        Command::new("sh")
            .args(["-c", "sleep 5"])
            .spawn()
            .expect("test process should spawn")
    }
}
