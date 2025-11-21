use crate::services::directory::remote_directory_service::RemoteDirectoryService;
use std::process::Command;

pub struct AccessPointService;

impl AccessPointService {
    /// Set the robot to access point mode (broadcast WiFi)
    /// This allows the robot to create its own WiFi network when on the go
    /// This function runs locally on the robot
    pub async fn set_access_point(
        ssid: String,
        password: String,
    ) -> Result<Option<String>, String> {
        println!("[AccessPoint] Setting access point mode for robot");
        println!("[AccessPoint] SSID: {}", ssid);

        // Get the working directory on the robot (local path)
        let working_dir = RemoteDirectoryService::get_sourccey_desktop_root()?;
        println!("[AccessPoint] Working directory: {:?}", working_dir);

        // Build the script path - scripts are in scripts/connection/local/ relative to sourccey-desktop dir
        let script_path = working_dir.join("scripts").join("connection").join("local").join("set_access_point.py");
        println!("[AccessPoint] Script path: {:?}", script_path);
        if !script_path.exists() {
            return Err(format!("Script not found at: {:?}", script_path));
        }
        println!("[AccessPoint] Script exists: {:?}", script_path.exists());
        // Execute Python script locally
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
        println!("[AccessPoint] Output: {:?}", output);
        println!("[AccessPoint] Status: {:?}", output.status.success());
        // Check if command succeeded
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            println!("[AccessPoint] Stderr: {:?}", stderr);
            // Check for ERROR: prefix in stderr
            println!("[AccessPoint] Checking for ERROR: prefix in stderr");
            if stderr.contains("ERROR:") {
                println!("[AccessPoint] ERROR: prefix found in stderr");
                let error_msg = stderr
                    .lines()
                    .find(|line| line.contains("ERROR:"))
                    .unwrap_or(&stderr)
                    .trim();
                println!("[AccessPoint] Error message: {:?}", error_msg);
                return Err(error_msg.to_string());
            }
            println!("[AccessPoint] Returning error");
            return Err(format!("Script failed with status: {}", output.status));
        }

        // Parse output (stdout contains JSON)
        println!("[AccessPoint] Parsing output");
        let stdout = String::from_utf8_lossy(&output.stdout);
        println!("[AccessPoint] Stdout: {:?}", stdout);

        // Check for errors first
        if stdout.contains("ERROR:") {
            println!("[AccessPoint] ERROR: prefix found in stdout");
            let error_msg = stdout
                .lines()
                .find(|line| line.contains("ERROR:"))
                .unwrap_or(&stdout)
                .trim();
            println!("[AccessPoint] Error message: {:?}", error_msg);
            return Err(error_msg.to_string());
        }

        // Try to parse JSON output
        if let Ok(json_output) = serde_json::from_str::<serde_json::Value>(&stdout) {
            println!("[AccessPoint] JSON output: {:?}", json_output);
            let status = json_output
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            println!("[AccessPoint] Status: {:?}", status);
            if status == "SUCCESS" {
                println!("[AccessPoint] SUCCESS: status found in JSON output");
                let ip_address = json_output
                    .get("ip_address")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                println!("[AccessPoint] IP address: {:?}", ip_address);
                // Return None if IP is empty or invalid, otherwise return Some(ip)
                let result = ip_address
                    .filter(|ip| !ip.is_empty())
                    .map(|ip| {
                        println!("[AccessPoint] Access point mode activated successfully. IP: {}", ip);
                        ip
                    });

                println!("[AccessPoint] Result: {:?}", result);
                Ok(result)
            } else {
                println!("[AccessPoint] Returning error");
                Err(format!("Script returned status: {}", status))
            }
        } else {
            // If JSON parsing fails, check if there's any output
            if stdout.trim().is_empty() {
                println!("[AccessPoint] Script produced no output");
                Err("Script produced no output".to_string())
            } else {
                println!("[AccessPoint] Failed to parse script output");
                println!("[AccessPoint] Stdout: {:?}", stdout);
                Err("Failed to parse script output".to_string())
            }
        }
    }

    pub async fn is_access_point_active() -> Result<bool, String> {
        println!("[AccessPoint] Checking if access point is active");
        let output = Command::new("systemctl")
            .arg("is-active")
            .arg("hostapd")
            .output()
            .map_err(|e| format!("Failed to check if access point is active: {}", e))?;

        // systemctl is-active returns exit code 0 if active, non-zero if inactive
        println!("[AccessPoint] Output: {:?}", output);
        let is_active = output.status.success();
        println!("[AccessPoint] Access point active: {}", is_active);
        Ok(is_active)
    }
}
