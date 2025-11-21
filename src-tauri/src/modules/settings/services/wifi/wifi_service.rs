use crate::services::directory::remote_directory_service::RemoteDirectoryService;
use std::process::Command;

pub struct WiFiService;

impl WiFiService {
    /// Set the robot to WiFi mode (connect to existing WiFi network)
    /// This allows the robot to connect to a home/office WiFi network
    /// This function runs locally on the robot
    pub async fn set_wifi(
        ssid: String,
        password: String,
    ) -> Result<Option<String>, String> {
        println!("[WiFi] Setting WiFi mode for robot");
        println!("[WiFi] SSID: {}", ssid);

        // Get the working directory on the robot (local path)
        let working_dir = RemoteDirectoryService::get_sourccey_desktop_root()?;
        println!("[WiFi] Working directory: {:?}", working_dir);

        // Build the script path - scripts are in scripts/connection/local/ relative to sourccey-desktop dir
        let script_path = working_dir.join("scripts").join("connection").join("local").join("set_wifi.py");
        println!("[WiFi] Script path: {:?}", script_path);
        if !script_path.exists() {
            return Err(format!("Script not found at: {:?}", script_path));
        }
        println!("[WiFi] Script exists: {:?}", script_path.exists());

        // Execute Python script locally with sudo
        let output = Command::new("sudo")
            .arg("python")
            .arg(script_path.to_string_lossy().as_ref())
            .arg("--ssid")
            .arg(&ssid)
            .arg("--password")
            .arg(&password)
            .current_dir(&working_dir)
            .output()
            .map_err(|e| format!("Failed to execute script: {}", e))?;
        println!("[WiFi] Output: {:?}", output);
        println!("[WiFi] Status: {:?}", output.status.success());
        // Check if command succeeded
        if !output.status.success() {
            println!("[WiFi] Output failed");
            let stderr = String::from_utf8_lossy(&output.stderr);
            println!("[WiFi] Stderr: {:?}", stderr);
            // Check for ERROR: prefix in stderr
            if stderr.contains("ERROR:") {
                println!("[WiFi] ERROR: prefix found in stderr");
                let error_msg = stderr
                    .lines()
                    .find(|line| line.contains("ERROR:"))
                    .unwrap_or(&stderr)
                    .trim();
                println!("[WiFi] Error message: {:?}", error_msg);
                return Err(error_msg.to_string());
            }
            println!("[WiFi] Returning error");
            return Err(format!("Script failed w ith status: {}", output.status));
        }

        // Parse output (stdout contains JSON)
        println!("[WiFi] Parsing output");
        let stdout = String::from_utf8_lossy(&output.stdout);
        println!("[WiFi] Stdout: {:?}", stdout);
        // Check for errors first
        if stdout.contains("ERROR:") {
            println!("[WiFi] ERROR: prefix found in stdout");
            let error_msg = stdout
                .lines()
                .find(|line| line.contains("ERROR:"))
                .unwrap_or(&stdout)
                .trim();
            println!("[WiFi] Error message: {:?}", error_msg);
            return Err(error_msg.to_string());
        }

        // Try to parse JSON output
        if let Ok(json_output) = serde_json::from_str::<serde_json::Value>(&stdout) {
            println!("[WiFi] JSON output: {:?}", json_output);
            let status = json_output
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            println!("[WiFi] Status: {:?}", status);
            if status == "SUCCESS" {
                let ip_address = json_output
                    .get("ip_address")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                println!("[WiFi] IP address: {:?}", ip_address);
                // Return None if IP is "Not assigned" or empty, otherwise return Some(ip)
                let result = ip_address
                    .filter(|ip| !ip.is_empty() && ip != "Not assigned")
                    .map(|ip| {
                        println!("[WiFi] WiFi connection established successfully. IP: {}", ip);
                        ip
                    });
                println!("[WiFi] Result: {:?}", result);
                Ok(result)
            } else {
                println!("[WiFi] Returning error");
                Err(format!("Script returned status: {}", status))
            }
        } else {
            // If JSON parsing fails, check if there's any output
            if stdout.trim().is_empty() {
                println!("[WiFi] Script produced no output");
                Err("Script produced no output".to_string())
            } else {
                println!("[WiFi] Failed to parse script output");
                println!("[WiFi] Stdout: {:?}", stdout);
                Err("Failed to parse script output".to_string())
            }
        }
    }
}
