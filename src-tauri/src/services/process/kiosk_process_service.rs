use tauri::{AppHandle, Emitter};
use std::process::Command;

pub struct KioskProcessService;

impl KioskProcessService {
    /// Start monitoring for sourccey_host process via polling
    pub fn start_monitoring(app_handle: AppHandle) {
        tauri::async_runtime::spawn(async move {
            Self::monitor_with_polling(app_handle).await;
        });
    }
    
    /// Polling method for detecting sourccey_host process
    async fn monitor_with_polling(app_handle: AppHandle) {
        let mut previous_state = false;
        let mut is_waiting_for_ready = false;
        
        loop {
            let is_running = Self::is_sourccey_host_running();

            if is_running && !previous_state {
                if let Err(e) = app_handle.emit("kiosk-host-external-starting", ()) {
                    eprintln!("[ProcessMonitor] Failed to emit starting event: {}", e);
                }
                is_waiting_for_ready = true;
            } else if is_running && is_waiting_for_ready {
                // Process is running, check if it's actually ready (port 5555 open)
                if Self::is_host_ready().await {
                    if let Err(e) = app_handle.emit("kiosk-host-external-started", ()) {
                        eprintln!("[ProcessMonitor] Failed to emit started event: {}", e);
                    }
                    is_waiting_for_ready = false;
                }
            } else if !is_running && previous_state {
                if let Err(e) = app_handle.emit("kiosk-host-external-stopped", ()) {
                    eprintln!("[ProcessMonitor] Failed to emit stop event: {}", e);
                }
                is_waiting_for_ready = false;
            }

            previous_state = is_running;
            
            // Check more frequently when waiting for host to be ready
            let sleep_duration = if is_waiting_for_ready {
                tokio::time::Duration::from_millis(500)  // 0.5 seconds when waiting for ready
            } else {
                tokio::time::Duration::from_secs(5)  // 5 seconds for normal monitoring
            };
            tokio::time::sleep(sleep_duration).await;
        }
    }
    
    /// Check if the host is ready by testing if port 5555 is listening
    async fn is_host_ready() -> bool {
        use std::net::TcpStream;
        use std::time::Duration;
        
        // Try to connect to localhost:5555 (ZMQ command port)
        match TcpStream::connect_timeout(
            &"127.0.0.1:5555".parse().unwrap(),
            Duration::from_millis(500)
        ) {
            Ok(_) => true,
            Err(_) => false,
        }
    }
    
    /// Check if sourccey_host process is running
    fn is_sourccey_host_running() -> bool {
        #[cfg(target_os = "linux")]
        {
            // Try pgrep first (most efficient)
            if let Ok(output) = Command::new("pgrep")
                .arg("-f")
                .arg("sourccey_host")
                .output()
            {
                return output.status.success() && !output.stdout.is_empty();
            }
            
            // Fallback to ps aux
            if let Ok(output) = Command::new("ps")
                .arg("aux")
                .output()
            {
                if let Ok(stdout) = String::from_utf8(output.stdout) {
                    return stdout.lines().any(|line| {
                        line.contains("sourccey_host") && !line.contains("grep")
                    });
                }
            }
        }
        false
    }
}
