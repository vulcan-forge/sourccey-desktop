use crate::modules::log::services::command_log_service::CommandLogService;
use sea_orm::DatabaseConnection;
use serde_json::Value;
use std::collections::HashMap;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

pub struct ProcessService;

impl ProcessService {
    /// Check if a process with the given PID is still alive
    pub fn is_process_alive(app_handle: &AppHandle, pid: u32) -> bool {
        #[cfg(windows)]
        {
            Self::is_process_alive_shell(app_handle, pid)
        }

        #[cfg(not(windows))]
        {
            let _ = app_handle;
            let output = Command::new("ps").args(&["-p", &pid.to_string()]).output();

            match output {
                Ok(output) => output.status.success(),
                Err(_) => false,
            }
        }
    }

    /// Get the exit code of a process by PID (Windows only for now)
    /// Returns None if we can't determine the exit code
    #[cfg(windows)]
    fn get_process_exit_code(app_handle: &AppHandle, pid: u32) -> Option<i32> {
        let output = Self::run_shell_command(
            app_handle,
            "wmic",
            &[
                "process",
                "where",
                &format!("ProcessId={}", pid),
                "get",
                "ExitStatus",
                "/format:value",
            ],
        )
        .ok()?;

        for line in output.lines() {
            if line.starts_with("ExitStatus=") {
                if let Some(exit_code_str) = line.strip_prefix("ExitStatus=") {
                    if let Ok(exit_code) = exit_code_str.trim().parse::<i32>() {
                        return Some(exit_code);
                    }
                }
            }
        }
        None
    }

    #[cfg(not(windows))]
    fn get_process_exit_code(_app_handle: &AppHandle, _pid: u32) -> Option<i32> {
        // On Unix systems, this is more complex and would require different approach
        // For now, return None to maintain compatibility
        None
    }

    /// Update command log when a process shuts down
    ///
    /// # Arguments
    /// * `pid` - The process ID to get exit code for
    /// * `command_log_id` - The command log ID to update
    /// * `db_connection` - Database connection for the command log service
    pub fn on_process_shutdown(
        app_handle: &AppHandle,
        pid: u32,
        db_connection: DatabaseConnection,
        command_log_id: String,
    ) {
        let command_log_service = CommandLogService::new(db_connection);
        let exit_code = Self::get_process_exit_code(app_handle, pid);

        let status = match exit_code {
            Some(0) => "success".to_string(),
            Some(_) => "failed".to_string(),
            None => "success".to_string(),
        };

        let error_message = if status == "failed" {
            Some(format!("Process exited with code: {:?}", exit_code))
        } else {
            None
        };

        // Spawn a regular thread to handle the async database operation
        std::thread::spawn(move || {
            // Because we are using the command log service which is async
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                if let Err(e) = command_log_service
                    .update_robot_command_log(command_log_id, status, exit_code, error_message)
                    .await
                {
                    eprintln!("Failed to update command log: {}", e);
                }
            });
        });
    }

    /// Start a monitoring thread for a process that will emit events when the process dies
    /// Always emits the event but includes the exit code in the metadata
    ///
    /// # Arguments
    /// * `pid` - The process ID to monitor
    /// * `app_handle` - The Tauri app handle for emitting events
    /// * `shutdown_flag` - Atomic boolean flag to signal the monitoring thread to stop
    /// * `emit_key` - The event key to emit when process fails
    /// * `metadata` - Additional metadata to include in the failure event
    /// * `initial_delay_secs` - Initial delay before starting monitoring (in seconds)
    /// * `check_interval_ms` - How often to check if the process is alive (in milliseconds)
    pub fn start_process_monitor(
        pid: u32,
        app_handle: AppHandle,
        shutdown_flag: Arc<AtomicBool>,
        emit_key: String,
        mut metadata: Value,
        initial_delay_secs: u64,
        check_interval_ms: u64,
        on_shutdown: Option<Box<dyn Fn() + Send + 'static>>,
    ) {
        std::thread::spawn(move || {
            // Wait for initial delay before starting monitoring
            std::thread::sleep(std::time::Duration::from_secs(initial_delay_secs));

            loop {
                std::thread::sleep(std::time::Duration::from_millis(check_interval_ms));

                if shutdown_flag.load(Ordering::Relaxed) {
                    break;
                }

                // Check if process is still running
                if !Self::is_process_alive(&app_handle, pid) {
                    // Process has died - get exit code and always emit event
                    let exit_code = Self::get_process_exit_code(&app_handle, pid);

                    // Update metadata with exit code (or null if we can't determine it)
                    if let Some(obj) = metadata.as_object_mut() {
                        match exit_code {
                            Some(code) => {
                                obj.insert(
                                    "exit_code".to_string(),
                                    serde_json::Value::Number(code.into()),
                                );
                            }
                            None => {
                                obj.insert("exit_code".to_string(), serde_json::Value::Null);
                            }
                        }
                    }

                    let _ = app_handle.emit(&emit_key, &metadata);

                    // Call the on_shutdown callback if provided
                    if let Some(callback) = on_shutdown {
                        callback();
                    }

                    break;
                }
            }
        });
    }

    #[cfg(windows)]
    fn is_process_alive_shell(app_handle: &AppHandle, pid: u32) -> bool {
        let output = Self::run_shell_command(app_handle, "tasklist", &["/FI", &format!("PID eq {}", pid)]);
        match output {
            Ok(output) => output.contains(&pid.to_string()),
            Err(_) => false,
        }
    }

    #[cfg(windows)]
    fn run_shell_command(
        app_handle: &AppHandle,
        program: &str,
        args: &[&str],
    ) -> Result<String, String> {
        tauri::async_runtime::block_on(async move {
            let cmd = app_handle.shell().command(program).args(args.iter());
            let (mut rx, _child) = cmd.spawn().map_err(|e| e.to_string())?;
            let mut output = String::new();

            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        output.push_str(&String::from_utf8_lossy(&bytes));
                    }
                    CommandEvent::Stderr(bytes) => {
                        output.push_str(&String::from_utf8_lossy(&bytes));
                    }
                    CommandEvent::Terminated(_) => break,
                    _ => {}
                }
            }

            Ok(output)
        })
    }

    /// Convenience method for starting process monitoring with common defaults
    /// Uses 15 second initial delay and 5 second check interval
    /// Automatically removes the process from the state HashMap when it dies
    pub fn start_process_monitor_with_defaults<T: Send + 'static>(
        pid: u32,
        app_handle: AppHandle,
        state: Arc<Mutex<HashMap<String, T>>>,
        shutdown_flag: Arc<AtomicBool>,
        process_key: String,
        emit_key: String,
        metadata: Value,
        command_log_id: Option<String>,
        db_connection: Option<DatabaseConnection>,
    ) {
        let app_handle_for_shutdown = app_handle.clone();
        Self::start_process_monitor(
            pid,
            app_handle,
            shutdown_flag,
            emit_key,
            metadata,
            15,   // 15 second initial delay
            5000, // 5 second check interval
            Some(Box::new(move || {
                let _ = state.lock().unwrap().remove(&process_key);

                if let (Some(db_conn), Some(log_id)) = (db_connection.clone(), command_log_id.clone())
                {
                    Self::on_process_shutdown(&app_handle_for_shutdown, pid, db_conn, log_id);
                } else {
                    eprintln!(
                        "Failed to update command log: No database connection or command log ID"
                    );
                }
            })),
        );
    }
}
