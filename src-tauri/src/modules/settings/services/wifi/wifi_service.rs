use crate::modules::control::services::communication::ssh_service::SshService;
use crate::modules::control::types::configuration::configuration_types::RemoteConfig;
use crate::services::directory::remote_directory_service::RemoteDirectoryService;
use tauri::{AppHandle, Emitter};

pub struct WiFiService;

impl WiFiService {
    /// Set the robot to WiFi mode (connect to existing WiFi network)
    /// This allows the robot to connect to a home/office WiFi network
    pub async fn set_wifi(
        app_handle: AppHandle,
        config: &RemoteConfig,
        ssid: String,
        password: String,
    ) -> Result<String, String> {
        println!("[WiFi] Setting WiFi mode for robot");
        println!("[WiFi] SSID: {}", ssid);

        // Create SSH session
        let mut session = SshService::create_ssh_session_async(
            &config.remote_ip,
            &config.remote_port,
            &config.username,
            &config.password,
        )
        .await
        .map_err(|e| format!("Failed to create SSH session: {}", e))?;

        // Get the working directory on the robot
        let working_dir = RemoteDirectoryService::get_sourccey_desktop_root()?;
        let working_dir_str = RemoteDirectoryService::to_linux_path_string(&working_dir);

        // Build the script path - scripts are in scripts/connection/ relative to sourccey-desktop dir
        let script_path = format!("{}/scripts/connection/set_wifi.py", working_dir_str);

        // Execute Python script via SSH
        // Using python3 explicitly and redirecting stderr to stdout for error capture
        let script_cmd = format!(
            "cd {} && python {} --ssid {} --password {} 2>&1",
            shell_escape(&working_dir_str),
            shell_escape(&script_path),
            shell_escape(&ssid),
            shell_escape(&password)
        );

        match SshService::execute_command_read_output_async(&mut session, &script_cmd, 30).await {
            Ok(Some(output)) => {
                // Check for errors first (scripts output errors to stderr which we capture)
                if output.contains("ERROR:") {
                    // Extract error message
                    let error_msg = output
                        .lines()
                        .find(|line| line.contains("ERROR:"))
                        .unwrap_or(&output)
                        .trim();
                    return Err(error_msg.to_string());
                }

                // Try to parse JSON output
                if let Ok(json_output) = serde_json::from_str::<serde_json::Value>(&output) {
                    let status = json_output
                        .get("status")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    if status == "SUCCESS" {
                        let ip_address = json_output
                            .get("ip_address")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Not assigned");
                        let message = json_output
                            .get("message")
                            .and_then(|v| v.as_str())
                            .unwrap_or("WiFi connection established successfully");

                        let _ = app_handle.emit(
                            "wifi-set-success",
                            serde_json::json!({
                                "ssid": ssid,
                                "ip_address": ip_address,
                                "message": message
                            }),
                        );

                        println!("[WiFi] WiFi connection established successfully");
                        Ok(format!(
                            "Connected to WiFi '{}' successfully. IP: {}",
                            ssid, ip_address
                        ))
                    } else {
                        Err(format!("Script returned status: {}", status))
                    }
                } else {
                    // If JSON parsing fails, check if there's any output
                    if output.trim().is_empty() {
                        Err("Script produced no output".to_string())
                    } else {
                        // Return raw output as fallback
                        Ok(output.trim().to_string())
                    }
                }
            }
            Ok(None) => Err("Script produced no output".to_string()),
            Err(e) => Err(format!("Script execution failed: {}", e)),
        }
    }
}

/// Helper function to escape shell arguments
fn shell_escape(s: &str) -> String {
    // Simple escaping - wrap in single quotes and escape any single quotes inside
    format!("'{}'", s.replace('\'', "'\"'\"'"))
}
