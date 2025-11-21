use crate::services::directory::remote_directory_service::RemoteDirectoryService;
use std::process::Command;

pub struct WiFiService;

impl WiFiService {
    /// Disable access point mode and attempt to reconnect to saved WiFi networks
    /// This disables AP mode and automatically attempts to reconnect to previously saved WiFi networks
    /// If no saved networks are found or connection fails, AP mode is still disabled
    /// This function runs locally on the robot
    pub async fn set_wifi(ssid: String) -> Result<String, String> {
        println!("[WiFi] Disabling access point mode for robot");

        // Get the working directory on the robot (local path)
        let working_dir = RemoteDirectoryService::get_sourccey_desktop_root()?;

        // Build the script path - scripts are in scripts/connection/local/ relative to sourccey-desktop dir
        let script_path = working_dir.join("scripts").join("connection").join("local").join("set_wifi.py");
        if !script_path.exists() {
            return Err(format!("Script not found at: {:?}", script_path));
        }

        // Execute Python script locally with sudo (no arguments needed - just disables AP mode)
        let output = Command::new("sudo")
            .arg("python")
            .arg(script_path.to_string_lossy().as_ref())
            .arg("--ssid")
            .arg(&ssid)
            .current_dir(&working_dir)
            .output()
            .map_err(|e| format!("Failed to execute script: {}", e))?;

        // Check if command succeeded
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Check for ERROR: prefix in stderr
            if stderr.contains("ERROR:") {
                let error_msg = stderr
                    .lines()
                    .find(|line| line.contains("ERROR:"))
                    .unwrap_or(&stderr)
                    .trim();
                return Err(error_msg.to_string());
            }
            return Err(format!("Script failed w ith status: {}", output.status));
        }

        // Parse output (stdout contains JSON)
        let stdout = String::from_utf8_lossy(&output.stdout);
        // Check for errors first
        if stdout.contains("ERROR:") {
            let error_msg = stdout
                .lines()
                .find(|line| line.contains("ERROR:"))
                .unwrap_or(&stdout)
                .trim();
            return Err(error_msg.to_string());
        }

        // Try to parse JSON output
        if let Ok(json_output) = serde_json::from_str::<serde_json::Value>(&stdout) {
            let status = json_output
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if status == "SUCCESS" {
                // Script attempts automatic WiFi reconnection, but we don't return connection details
                Ok("SUCCESS".to_string())
            } else {
                Err(format!("Script returned status: {}", status))
            }
        } else {
            // If JSON parsing fails, check if there's any output
            if stdout.trim().is_empty() {
                Err("Script produced no output".to_string())
            } else {
                Err("Failed to parse script output".to_string())
            }
        }
    }
}
