use crate::modules::control::services::kiosk_control::kiosk_host_service::{
    KioskHostProcess, KioskHostService,
};
use crate::modules::control::services::kiosk_control::pairing_service::{
    KioskPairingService, KioskPairingState,
};
use crate::modules::status::services::battery::battery_service::{BatteryData, BatteryService};
use crate::utils::windows_process::configure_std_command;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::Write;
use std::process::{Command, Stdio};
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Serialize)]
pub struct SystemInfo {
    ip_address: String,
    temperature: String,
    thermal_data: ThermalData,
    battery_data: BatteryData,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct ThermalData {
    pub temperature_celsius: Option<f64>,
    pub status: String,
    pub fan_speed_rpm: Option<u32>,
    pub fan_running: Option<bool>,
    pub cooling_state: Option<u32>,
    pub cooling_max_state: Option<u32>,
    pub source: Option<String>,
}

// Initialize the state
pub fn init_kiosk_host() -> KioskHostProcess {
    KioskHostService::init_kiosk_host()
}

#[command]
pub async fn start_kiosk_host(
    app_handle: AppHandle,
    state: State<'_, KioskHostProcess>,
    pairing_state: State<'_, KioskPairingState>,
    nickname: String,
) -> Result<String, String> {
    // Refresh cloud pairing state only when a registration flow was already
    // started and we still do not have final credentials on disk yet.
    // This uses blocking HTTP/file I/O, so keep it off the async Tokio worker.
    let pairing_state_inner = pairing_state.inner().clone();
    if let Err(error) = tauri::async_runtime::spawn_blocking(move || {
        if KioskPairingService::should_refresh_cloud_pairing_before_host_start().unwrap_or(false) {
            if let Err(error) =
                KioskPairingService::get_kiosk_cloud_pairing_info(pairing_state_inner)
            {
                eprintln!(
                    "Failed to refresh cloud pairing state before host start: {}",
                    error
                );
            }
        }
    })
    .await
    {
        eprintln!(
            "Failed to run cloud pairing refresh task before host start: {}",
            error
        );
    }

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
pub fn get_system_info() -> SystemInfo {
    let ip_address = get_ip_address();
    let thermal_data = get_thermal_data();
    let temperature = thermal_data
        .temperature_celsius
        .map(|value| format!("{value:.0}°C"))
        .unwrap_or_else(|| "Unknown".to_string());
    let battery_data = BatteryService::get_battery_data().unwrap_or_else(|error| {
        eprintln!("Failed to read battery data: {error}");
        BatteryData {
            voltage: -1.0,
            current_a: -1.0,
            remaining_capacity_ah: -1.0,
            max_capacity_ah: -1.0,
            state_of_charge: -1,
            max_error: -1,
            error: Some(error),
        }
    });
    SystemInfo {
        ip_address,
        temperature,
        thermal_data,
        battery_data,
    }
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
        let mut command = Command::new("ipconfig");
        configure_std_command(&mut command);
        if let Ok(output) = command.output() {
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

    "Disconnected".to_string()
}

#[cfg(any(target_os = "linux", target_os = "windows"))]
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

pub(crate) fn get_thermal_data() -> ThermalData {
    #[cfg(target_os = "linux")]
    {
        let temp_paths = [
            "/sys/class/thermal/thermal_zone0/temp",
            "/sys/class/hwmon/hwmon0/temp1_input",
            "/sys/class/hwmon/hwmon1/temp1_input",
        ];
        let mut temperature_celsius = None;
        let mut source = None;
        for path in &temp_paths {
            if let Some(raw) = read_sysfs_number(path) {
                temperature_celsius = Some(if raw.abs() >= 1_000.0 {
                    raw / 1_000.0
                } else {
                    raw
                });
                source = Some((*path).to_string());
                break;
            }
        }

        if temperature_celsius.is_none() {
            if let Ok(output) = Command::new("vcgencmd").arg("measure_temp").output() {
                if let Ok(value) = String::from_utf8(output.stdout) {
                    temperature_celsius = value
                        .trim()
                        .strip_prefix("temp=")
                        .and_then(|value| value.trim_end_matches("'C").parse::<f64>().ok());
                    if temperature_celsius.is_some() {
                        source = Some("vcgencmd".to_string());
                    }
                }
            }
        }

        let fan_speed_rpm = (0..10).find_map(|index| {
            read_sysfs_number(&format!("/sys/class/hwmon/hwmon{index}/fan1_input"))
                .map(|value| value.max(0.0) as u32)
        });
        let cooling_device = (0..10).find_map(|index| {
            let base = format!("/sys/class/thermal/cooling_device{index}");
            let device_type = std::fs::read_to_string(format!("{base}/type")).ok()?;
            if !device_type.to_ascii_lowercase().contains("fan") {
                return None;
            }
            Some((
                read_sysfs_number(&format!("{base}/cur_state")).map(|value| value.max(0.0) as u32),
                read_sysfs_number(&format!("{base}/max_state")).map(|value| value.max(0.0) as u32),
            ))
        });
        let (cooling_state, cooling_max_state) = cooling_device.unwrap_or((None, None));
        let fan_running = fan_speed_rpm
            .map(|rpm| rpm > 0)
            .or_else(|| cooling_state.map(|state| state > 0));

        return ThermalData {
            temperature_celsius,
            status: thermal_status(temperature_celsius),
            fan_speed_rpm,
            fan_running,
            cooling_state,
            cooling_max_state,
            source,
        };
    }

    #[cfg(not(target_os = "linux"))]
    ThermalData {
        temperature_celsius: None,
        status: "Unavailable".to_string(),
        fan_speed_rpm: None,
        fan_running: None,
        cooling_state: None,
        cooling_max_state: None,
        source: None,
    }
}

#[cfg(target_os = "linux")]
fn read_sysfs_number(path: &str) -> Option<f64> {
    std::fs::read_to_string(path)
        .ok()?
        .trim()
        .parse::<f64>()
        .ok()
}

#[cfg(target_os = "linux")]
fn thermal_status(temperature_celsius: Option<f64>) -> String {
    match temperature_celsius {
        Some(value) if value < 60.0 => "Normal",
        Some(value) if value < 75.0 => "Warm",
        Some(value) if value < 85.0 => "Hot",
        Some(_) => "Critical",
        None => "Unavailable",
    }
    .to_string()
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

#[cfg(target_os = "linux")]
fn validate_single_line_field(value: &str, field_name: &str) -> Result<(), String> {
    if value.contains('\n') || value.contains('\r') || value.contains('\0') {
        return Err(format!(
            "{} cannot contain newlines or null bytes",
            field_name
        ));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn validate_chpasswd_password(password: &str) -> Result<(), String> {
    validate_single_line_field(password, "Password")?;
    if password.contains(':') {
        return Err("Password cannot contain ':' for system password updates".to_string());
    }
    Ok(())
}

#[command]
pub fn set_pi_password(password: String) -> Result<String, String> {
    if password.trim().is_empty() {
        return Err("Password cannot be empty".to_string());
    }
    if password.len() < 6 {
        return Err("Password must be at least 6 characters".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        validate_chpasswd_password(&password)?;

        // The kiosk image provisions a fixed SSH account. Do not allow this
        // command to target arbitrary system users.
        let input = format!("sourccey:{}\n", password);
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
