use crate::modules::control::services::kiosk_control::kiosk_host_service::{
    KioskHostProcess, KioskHostService,
};
use crate::modules::status::services::battery::battery_service::{BatteryData, BatteryService};
use serde::Serialize;
use serde_json::json;
use std::process::{Command, Stdio};
use std::io::Write;
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Serialize)]
pub struct SystemInfo {
    ip_address: String,
    temperature: String,
    battery_data: BatteryData,
}

// Initialize the state
pub fn init_kiosk_host() -> KioskHostProcess {
    KioskHostService::init_kiosk_host()
}

#[command]
pub async fn start_kiosk_host(
    app_handle: AppHandle,
    state: State<'_, KioskHostProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    KioskHostService::start_kiosk_host(app_handle, db_connection, &state, nickname).await
}

#[command]
pub fn stop_kiosk_host(
    app_handle: AppHandle,
    state: State<KioskHostProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    KioskHostService::stop_kiosk_host(app_handle, db_connection, &state, nickname)
}

#[command]
pub fn is_kiosk_host_active(state: State<KioskHostProcess>, nickname: String) -> bool {
    KioskHostService::is_kiosk_host_active(&state, nickname)
}

#[command]
pub fn get_active_kiosk_host_sessions(state: State<KioskHostProcess>) -> Vec<String> {
    KioskHostService::get_active_kiosk_host_sessions(&state)
}

#[command]
pub fn get_system_info() -> SystemInfo {
    let ip_address = get_ip_address();
    let temperature = get_temperature();
    let battery_data = BatteryService::get_battery_data().unwrap_or_else(|_| BatteryData {
        voltage: 0.0,
        percent: 0,
    });
    SystemInfo { ip_address, temperature, battery_data }
}

fn get_ip_address() -> String {
    // Use hostname -I to get all IPs, then pick the best private one
    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = Command::new("hostname").arg("-I").output() {
            if let Ok(ip_str) = String::from_utf8(output.stdout) {
                let all_ips: Vec<&str> = ip_str.trim().split_whitespace().collect();

                // Look for 192.168.x.x first (most common for home networks)
                for ip in &all_ips {
                    if ip.starts_with("192.168.") {
                        return ip.to_string();
                    }
                }

                // Then look for other private IPs
                for ip in &all_ips {
                    if is_private_ip(ip) {
                        return ip.to_string();
                    }
                }

                // If no private IP found, return the first one
                if let Some(first_ip) = all_ips.first() {
                    return first_ip.to_string();
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("ipconfig").output() {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                let mut private_ips = Vec::new();
                let mut all_ips = Vec::new();

                // Look for IPv4 Address lines
                for line in output_str.lines() {
                    if line.contains("IPv4 Address") {
                        if let Some(ip) = line.split(':').nth(1) {
                            let ip = ip.trim();
                            all_ips.push(ip);
                            if is_private_ip(ip) {
                                private_ips.push(ip);
                            }
                        }
                    }
                }

                // Return private IP if found, otherwise first IP
                if !private_ips.is_empty() {
                    return private_ips[0].to_string();
                } else if !all_ips.is_empty() {
                    return all_ips[0].to_string();
                }
            }
        }
    }

    "Unknown".to_string()
}

fn is_private_ip(ip: &str) -> bool {
    // Check if IP is in private ranges:
    // 192.168.0.0/16 (192.168.0.0 - 192.168.255.255)
    // 10.0.0.0/8 (10.0.0.0 - 10.255.255.255)
    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)

    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() != 4 {
        return false;
    }

    if let (Ok(a), Ok(b), Ok(_c), Ok(_d)) = (
        parts[0].parse::<u8>(),
        parts[1].parse::<u8>(),
        parts[2].parse::<u8>(),
        parts[3].parse::<u8>(),
    ) {
        // 192.168.x.x
        if a == 192 && b == 168 {
            return true;
        }
        // 10.x.x.x
        if a == 10 {
            return true;
        }
        // 172.16.x.x - 172.31.x.x
        if a == 172 && b >= 16 && b <= 31 {
            return true;
        }
    }

    false
}

fn get_temperature() -> String {
    // Try to get CPU temperature on Linux
    #[cfg(target_os = "linux")]
    {
        // Try different common temperature sensors
        let temp_paths = [
            "/sys/class/thermal/thermal_zone0/temp",
            "/sys/class/hwmon/hwmon0/temp1_input",
            "/sys/class/hwmon/hwmon1/temp1_input",
        ];

        for path in &temp_paths {
            if let Ok(temp_str) = std::fs::read_to_string(path) {
                if let Ok(temp_millic) = temp_str.trim().parse::<i32>() {
                    let temp_celsius = temp_millic / 1000;
                    return format!("{}°C", temp_celsius);
                }
            }
        }

        // Try vcgencmd for Raspberry Pi
        if let Ok(output) = Command::new("vcgencmd").arg("measure_temp").output() {
            if let Ok(temp_str) = String::from_utf8(output.stdout) {
                if let Some(temp_part) = temp_str.strip_prefix("temp=") {
                    return temp_part.trim().to_string();
                }
            }
        }
    }

    "Unknown".to_string()
}

#[command]
pub fn get_pi_username() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        String::from_utf8(
            Command::new("whoami")
                .output()
                .map_err(|e| format!("Failed to run whoami: {}", e))?
                .stdout,
        )
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("Failed to parse whoami output: {}", e))
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok("unknown".to_string())
    }
}

#[command]
#[allow(unused_variables)] // username is used on Linux but unused on other platforms
pub fn set_pi_password(username: Option<String>, password: String) -> Result<String, String> {
    if password.trim().is_empty() {
        return Err("Password cannot be empty".to_string());
    }
    if password.len() < 8 {
        return Err("Password must be at least 8 characters".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        // Determine target user
        let user = if let Some(u) = username {
            let trimmed = u.trim();
            if trimmed.is_empty() {
                // fallback to whoami
                String::from_utf8(
                    Command::new("whoami")
                        .output()
                        .map_err(|e| format!("Failed to run whoami: {}", e))?
                        .stdout,
                )
                .unwrap_or_default()
                .trim()
                .to_string()
            } else {
                trimmed.to_string()
            }
        } else {
            String::from_utf8(
                Command::new("whoami")
                    .output()
                    .map_err(|e| format!("Failed to run whoami: {}", e))?
                    .stdout,
            )
            .unwrap_or_default()
            .trim()
            .to_string()
        };

        // Use chpasswd for non-interactive password update: echo "user:pass" | sudo chpasswd
        let input = format!("{}:{}\n", user, password);
        let mut child = Command::new("sudo")
            .arg("chpasswd")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn sudo chpasswd: {}", e))?;

        if let Some(stdin) = child.stdin.as_mut() {
            stdin
                .write_all(input.as_bytes())
                .map_err(|e| format!("Failed to write to chpasswd stdin: {}", e))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| format!("Failed to wait for chpasswd: {}", e))?;

        if output.status.success() {
            Ok("Password updated".to_string())
        } else {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            Err(format!("chpasswd failed: {}", err))
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        Err("Setting system password is only supported on Linux hosts".to_string())
    }
}

fn get_ssh_password_status_file_path() -> std::path::PathBuf {
    // Store in home directory - persists across builds, database wipes, etc.
    dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".sourccey_ssh_password_changed")
}

#[command]
pub fn get_ssh_password_changed_status() -> Result<bool, String> {
    let file_path = get_ssh_password_status_file_path();
    Ok(file_path.exists())
}

#[command]
pub fn set_ssh_password_changed_status(changed: bool) -> Result<(), String> {
    let file_path = get_ssh_password_status_file_path();

    if changed {
        // Create the marker file
        std::fs::write(&file_path, "true")
            .map_err(|e| format!("Failed to write password status file: {}", e))?;
    } else {
        // Remove the marker file if it exists
        if file_path.exists() {
            std::fs::remove_file(&file_path)
                .map_err(|e| format!("Failed to remove password status file: {}", e))?;
        }
    }

    Ok(())
}
