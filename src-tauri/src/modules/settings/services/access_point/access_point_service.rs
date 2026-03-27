use crate::services::directory::directory_service::DirectoryService;
use crate::services::directory::remote_directory_service::RemoteDirectoryService;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

pub struct AccessPointService;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessPointCredentials {
    pub ssid: String,
    pub password: String,
}

impl AccessPointService {
    /// Set the robot to access point mode (broadcast WiFi)
    /// This allows the robot to create its own WiFi network when on the go
    /// This function runs locally on the robot
    pub async fn set_access_point(
        ssid: String,
        password: String,
    ) -> Result<Option<String>, String> {
        println!("[AccessPoint] Setting access point mode for robot SSID: {}", ssid);

        // Get the working directory on the robot (local path)
        let working_dir = RemoteDirectoryService::get_sourccey_desktop_root()?;

        // Build the script path - scripts are in scripts/connection/local/ relative to sourccey-desktop dir
        let script_path = working_dir.join("scripts").join("connection").join("local").join("set_access_point.py");
        if !script_path.exists() {
            return Err(format!("Script not found at: {:?}", script_path));
        }
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
            return Err(format!("Script failed with status: {}", output.status));
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
                let ip_address = json_output
                    .get("ip_address")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                // Return None if IP is empty or invalid, otherwise return Some(ip)
                let result = ip_address
                    .filter(|ip| !ip.is_empty())
                    .map(|ip| {
                        ip
                    });

                Ok(result)
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

    pub async fn is_access_point_active() -> Result<bool, String> {
        println!("[AccessPoint] Checking if access point is active");
        let output = Command::new("nmcli")
            .arg("-t")
            .arg("-f")
            .arg("NAME")
            .arg("connection")
            .arg("show")
            .arg("--active")
            .output()
            .map_err(|e| format!("Failed to check if access point is active: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let is_active = stdout.contains("Hotspot");
        Ok(is_active)
    }

    pub fn get_saved_access_point_credentials() -> Result<Option<AccessPointCredentials>, String> {
        let path = Self::credentials_file_path()?;
        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read access point credentials {:?}: {}", path, e))?;
        let parsed = serde_json::from_str::<AccessPointCredentials>(&content)
            .map_err(|e| format!("Failed to parse access point credentials {:?}: {}", path, e))?;

        Self::validate_credentials(&parsed.ssid, &parsed.password)?;
        Ok(Some(parsed))
    }

    pub fn save_access_point_credentials(ssid: String, password: String) -> Result<(), String> {
        Self::validate_credentials(&ssid, &password)?;
        let path = Self::credentials_file_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create access point credentials directory {:?}: {}", parent, e))?;
        }

        let payload = AccessPointCredentials {
            ssid: ssid.trim().to_string(),
            password,
        };

        let serialized = serde_json::to_string_pretty(&payload)
            .map_err(|e| format!("Failed to encode access point credentials: {}", e))?;
        fs::write(&path, serialized)
            .map_err(|e| format!("Failed to write access point credentials {:?}: {}", path, e))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o600);
            fs::set_permissions(&path, perms)
                .map_err(|e| format!("Failed to secure access point credentials file {:?}: {}", path, e))?;
        }

        Ok(())
    }

    fn validate_credentials(ssid: &str, password: &str) -> Result<(), String> {
        let trimmed_ssid = ssid.trim();
        if trimmed_ssid.is_empty() {
            return Err("SSID is required".to_string());
        }
        if password.is_empty() {
            return Err("Password is required".to_string());
        }
        if trimmed_ssid.contains('\n')
            || trimmed_ssid.contains('\r')
            || trimmed_ssid.contains('\0')
            || password.contains('\n')
            || password.contains('\r')
            || password.contains('\0')
        {
            return Err("SSID/password cannot contain control characters".to_string());
        }
        Ok(())
    }

    fn credentials_file_path() -> Result<PathBuf, String> {
        let cache_dir = DirectoryService::get_lerobot_cache_dir()?;
        Ok(cache_dir.join("settings").join("access_point_credentials.json"))
    }
}
