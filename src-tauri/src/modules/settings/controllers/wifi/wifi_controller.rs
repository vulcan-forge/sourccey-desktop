use serde::{Deserialize, Serialize};
use std::process::Command;
use crate::modules::settings::services::wifi::wifi_service::WiFiService;
use crate::modules::control::types::configuration::configuration_types::RemoteConfig;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WiFiNetwork {
    pub ssid: String,
    pub signal_strength: i32,
    pub security: String,
}

/// Scan for available WiFi networks
#[tauri::command]
pub async fn scan_wifi_networks() -> Result<Vec<WiFiNetwork>, String> {
    #[cfg(target_os = "linux")]
    {
        scan_wifi_linux()
    }

    #[cfg(target_os = "windows")]
    {
        scan_wifi_windows()
    }

    #[cfg(target_os = "macos")]
    {
        scan_wifi_macos()
    }
}

/// Connect to a WiFi network
#[tauri::command]
pub async fn connect_to_wifi(ssid: String, password: String, security: Option<String>) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        connect_wifi_linux(ssid, password, security)
    }

    #[cfg(target_os = "windows")]
    {
        connect_wifi_windows(ssid, password, security)
    }

    #[cfg(target_os = "macos")]
    {
        connect_wifi_macos(ssid, password, security)
    }
}

/// Get currently connected WiFi network
#[tauri::command]
pub async fn get_current_wifi_connection() -> Result<Option<WiFiNetwork>, String> {
    #[cfg(target_os = "linux")]
    {
        get_current_wifi_linux()
    }

    #[cfg(target_os = "windows")]
    {
        get_current_wifi_windows()
    }

    #[cfg(target_os = "macos")]
    {
        get_current_wifi_macos()
    }
}

/// Disconnect from current WiFi network
#[tauri::command]
pub async fn disconnect_from_wifi() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        disconnect_wifi_linux()
    }

    #[cfg(target_os = "windows")]
    {
        disconnect_wifi_windows()
    }

    #[cfg(target_os = "macos")]
    {
        disconnect_wifi_macos()
    }
}

#[cfg(target_os = "linux")]
fn scan_wifi_linux() -> Result<Vec<WiFiNetwork>, String> {
    // Use nmcli (NetworkManager CLI) to scan for networks
    let output = Command::new("nmcli")
        .args(&["-t", "-f", "SSID,SIGNAL,SECURITY", "dev", "wifi"])
        .output()
        .map_err(|e| format!("Failed to scan WiFi: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "WiFi scan failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut networks = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() >= 3 {
            let ssid = parts[0].to_string();
            let signal = parts[1].parse::<i32>().unwrap_or(0);
            let security = parts[2].to_string();

            // Skip empty SSIDs
            if !ssid.is_empty() {
                networks.push(WiFiNetwork {
                    ssid,
                    signal_strength: signal,
                    security,
                });
            }
        }
    }

    // Sort by signal strength (highest first)
    networks.sort_by(|a, b| b.signal_strength.cmp(&a.signal_strength));

    Ok(networks)
}

#[cfg(target_os = "linux")]
fn connect_open_network(ssid: &str) -> Result<String, String> {
    let output = Command::new("nmcli")
        .args(&["device", "wifi", "connect", ssid])
        .output()
        .map_err(|e| format!("Failed to connect to WiFi: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Connection failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(format!("Successfully connected to {}", ssid))
}

#[cfg(target_os = "linux")]
fn connect_wifi_linux(ssid: String, password: String, security: Option<String>) -> Result<String, String> {
    // Determine key-mgmt type from security string
    let security_str = security.as_deref().unwrap_or("");

    // Check if it's an open network
    if security_str == "Open" || security_str.is_empty() {
        if !password.is_empty() {
            return Err("Open network does not require a password".to_string());
        }
        return connect_open_network(&ssid);
    }

    // Always set key-mgmt explicitly from the start
    // Determine key-mgmt type based on security string
    let key_mgmt = if security_str.contains("WPA3") {
        "wpa-psk" // WPA3-SAE, but nmcli may handle it automatically
    } else if security_str.contains("WPA2") || security_str.contains("WPA") {
        "wpa-psk"
    } else if security_str.contains("WEP") {
        "none" // WEP uses wep-key-type instead
    } else {
        // Unknown security type - try wpa-psk as default
        "wpa-psk"
    };

    // Delete any existing connection with this name first (ignore errors if it doesn't exist)
    let _ = Command::new("nmcli")
        .args(&["connection", "delete", &ssid])
        .output();

    // Create connection with explicit key-mgmt - single approach, no fallbacks
    let add_output = Command::new("nmcli")
        .args(&[
            "connection",
            "add",
            "type",
            "wifi",
            "con-name",
            &ssid,
            "ssid",
            &ssid,
            "wifi-sec.key-mgmt",
            key_mgmt,
            "wifi-sec.psk",
            &password,
        ])
        .output()
        .map_err(|e| format!("Failed to create WiFi connection: {}", e))?;

    if !add_output.status.success() {
        return Err(format!(
            "Failed to create connection: {}",
            String::from_utf8_lossy(&add_output.stderr)
        ));
    }

    // Activate the connection
    let up_output = Command::new("nmcli")
        .args(&["connection", "up", &ssid])
        .output()
        .map_err(|e| format!("Failed to activate WiFi connection: {}", e))?;

    if !up_output.status.success() {
        return Err(format!(
            "Connection failed: {}",
            String::from_utf8_lossy(&up_output.stderr)
        ));
    }

    Ok(format!("Successfully connected to {}", ssid))
}

#[cfg(target_os = "linux")]
fn get_current_wifi_linux() -> Result<Option<WiFiNetwork>, String> {
    // Use nmcli to get current connection
    let output = Command::new("nmcli")
        .args(&["-t", "-f", "ACTIVE,SSID,SIGNAL,SECURITY", "dev", "wifi"])
        .output()
        .map_err(|e| format!("Failed to get current WiFi: {}", e))?;

    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() >= 4 && parts[0] == "yes" {
            // We have an active connection
            let ssid = parts[1].to_string();
            let signal = parts[2].parse::<i32>().unwrap_or(0);
            let security = parts[3].to_string();

            return Ok(Some(WiFiNetwork {
                ssid,
                signal_strength: signal,
                security,
            }));
        }
    }

    Ok(None)
}

#[cfg(target_os = "linux")]
fn disconnect_wifi_linux() -> Result<String, String> {
    // First, get the WiFi device name
    let device_output = Command::new("nmcli")
        .args(&["-t", "-f", "DEVICE,TYPE", "device"])
        .output()
        .map_err(|e| format!("Failed to get WiFi device: {}", e))?;

    if !device_output.status.success() {
        return Err("Failed to find WiFi device".to_string());
    }

    let stdout = String::from_utf8_lossy(&device_output.stdout);
    let mut wifi_device = String::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() >= 2 && parts[1] == "wifi" {
            wifi_device = parts[0].to_string();
            break;
        }
    }

    if wifi_device.is_empty() {
        return Err("No WiFi device found".to_string());
    }

    // Now disconnect the WiFi device
    let output = Command::new("nmcli")
        .args(&["device", "disconnect", &wifi_device])
        .output()
        .map_err(|e| format!("Failed to disconnect from WiFi: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Disconnect failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok("Successfully disconnected from WiFi".to_string())
}

#[cfg(target_os = "windows")]
fn scan_wifi_windows() -> Result<Vec<WiFiNetwork>, String> {
    // Use netsh to scan for networks
    let output = Command::new("netsh")
        .args(&["wlan", "show", "networks", "mode=Bssid"])
        .output()
        .map_err(|e| format!("Failed to scan WiFi: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "WiFi scan failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut networks = Vec::new();
    let mut current_ssid = String::new();
    let mut current_signal = 0;
    let mut current_security = String::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("SSID") {
            // Save previous network if we have one
            if !current_ssid.is_empty() {
                networks.push(WiFiNetwork {
                    ssid: current_ssid.clone(),
                    signal_strength: current_signal,
                    security: current_security.clone(),
                });
            }

            // Start new network
            if let Some(colon_pos) = line.find(':') {
                current_ssid = line[colon_pos + 1..].trim().to_string();
                current_signal = 0;
                current_security = String::new();
            }
        } else if line.starts_with("Signal") {
            if let Some(colon_pos) = line.find(':') {
                let signal_str = line[colon_pos + 1..].trim();
                // Extract percentage from "85%"
                if let Some(percent_pos) = signal_str.find('%') {
                    current_signal = signal_str[..percent_pos].parse::<i32>().unwrap_or(0);
                }
            }
        } else if line.starts_with("Security") {
            if let Some(colon_pos) = line.find(':') {
                current_security = line[colon_pos + 1..].trim().to_string();
            }
        }
    }

    // Add the last network
    if !current_ssid.is_empty() {
        networks.push(WiFiNetwork {
            ssid: current_ssid,
            signal_strength: current_signal,
            security: current_security,
        });
    }

    // Sort by signal strength (highest first)
    networks.sort_by(|a, b| b.signal_strength.cmp(&a.signal_strength));

    Ok(networks)
}

#[cfg(target_os = "windows")]
fn connect_wifi_windows(ssid: String, password: String, security: Option<String>) -> Result<String, String> {
    // Create a temporary XML profile for the network
    let profile_xml = format!(
        r#"<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>{}</name>
    <SSIDConfig>
        <SSID>
            <name>{}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>{}</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
</WLANProfile>"#,
        ssid, ssid, password
    );

    println!("Connecting to WiFi: {} with password: {} and security: {:?}", ssid, password, security);

    // Write profile to temp file
    let profile_path = format!("C:\\temp_wifi_profile_{}.xml", ssid);
    std::fs::write(&profile_path, profile_xml)
        .map_err(|e| format!("Failed to create WiFi profile: {}", e))?;

    // Add the profile
    let add_output = Command::new("netsh")
        .args(&[
            "wlan",
            "add",
            "profile",
            &format!("filename={}", profile_path),
        ])
        .output()
        .map_err(|e| format!("Failed to add WiFi profile: {}", e))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&profile_path);

    if !add_output.status.success() {
        return Err(format!(
            "Failed to add profile: {}",
            String::from_utf8_lossy(&add_output.stderr)
        ));
    }

    // Connect to the network
    let connect_output = Command::new("netsh")
        .args(&["wlan", "connect", &format!("name={}", ssid)])
        .output()
        .map_err(|e| format!("Failed to connect to WiFi: {}", e))?;

    if !connect_output.status.success() {
        return Err(format!(
            "Connection failed: {}",
            String::from_utf8_lossy(&connect_output.stderr)
        ));
    }

    Ok(format!("Successfully connected to {}", ssid))
}

#[cfg(target_os = "windows")]
fn get_current_wifi_windows() -> Result<Option<WiFiNetwork>, String> {
    // Use netsh to get current connection
    let output = Command::new("netsh")
        .args(&["wlan", "show", "interfaces"])
        .output()
        .map_err(|e| format!("Failed to get current WiFi: {}", e))?;

    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut ssid = String::new();
    let mut signal = 0;
    let mut state = String::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("SSID") {
            if let Some(colon_pos) = line.find(':') {
                ssid = line[colon_pos + 1..].trim().to_string();
            }
        } else if line.starts_with("Signal") {
            if let Some(colon_pos) = line.find(':') {
                let signal_str = line[colon_pos + 1..].trim();
                // Extract percentage from "85%"
                if let Some(percent_pos) = signal_str.find('%') {
                    signal = signal_str[..percent_pos].parse::<i32>().unwrap_or(0);
                }
            }
        } else if line.starts_with("State") {
            if let Some(colon_pos) = line.find(':') {
                state = line[colon_pos + 1..].trim().to_string();
            }
        }
    }

    // Only return if we're connected
    if state.contains("connected") && !ssid.is_empty() {
        Ok(Some(WiFiNetwork {
            ssid,
            signal_strength: signal,
            security: "Unknown".to_string(), // Windows doesn't easily provide this info
        }))
    } else {
        Ok(None)
    }
}

#[cfg(target_os = "windows")]
fn disconnect_wifi_windows() -> Result<String, String> {
    // Use netsh to disconnect
    let output = Command::new("netsh")
        .args(&["wlan", "disconnect"])
        .output()
        .map_err(|e| format!("Failed to disconnect from WiFi: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Disconnect failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok("Successfully disconnected from WiFi".to_string())
}

#[cfg(target_os = "macos")]
fn scan_wifi_macos() -> Result<Vec<WiFiNetwork>, String> {
    // Use airport utility to scan
    let output = Command::new(
        "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport",
    )
    .args(&["-s"])
    .output()
    .map_err(|e| format!("Failed to scan WiFi: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "WiFi scan failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut networks = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            let ssid = parts[0].to_string();
            let signal_str = parts[1];
            let security = parts[2..].join(" ");

            // Parse signal strength (it's in dBm, convert to percentage)
            let signal = if let Ok(signal_dbm) = signal_str.parse::<i32>() {
                // Convert dBm to percentage (rough approximation)
                // -30 dBm = 100%, -90 dBm = 0%
                ((signal_dbm + 90) * 100 / 60).max(0).min(100)
            } else {
                0
            };

            networks.push(WiFiNetwork {
                ssid,
                signal_strength: signal,
                security,
            });
        }
    }

    // Sort by signal strength (highest first)
    networks.sort_by(|a, b| b.signal_strength.cmp(&a.signal_strength));

    Ok(networks)
}

#[cfg(target_os = "macos")]
fn connect_wifi_macos(ssid: String, password: String, security: Option<String>) -> Result<String, String> {
    // Use networksetup to connect
    println!("Connecting to WiFi: {} with password: {} and security: {:?}", ssid, password, security);
    let output = Command::new("networksetup")
        .args(&["-setairportnetwork", "en0", &ssid, &password])
        .output()
        .map_err(|e| format!("Failed to connect to WiFi: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Connection failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(format!("Successfully connected to {}", ssid))
}

#[cfg(target_os = "macos")]
fn get_current_wifi_macos() -> Result<Option<WiFiNetwork>, String> {
    // Use networksetup to get current connection
    let output = Command::new("networksetup")
        .args(&["-getairportnetwork", "en0"])
        .output()
        .map_err(|e| format!("Failed to get current WiFi: {}", e))?;

    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout.trim();

    // Check if we're connected (not "You are not associated with an AirPort network")
    if line.contains("You are not associated") || line.is_empty() {
        return Ok(None);
    }

    // Extract SSID from "Current Wi-Fi Network: NetworkName"
    if let Some(colon_pos) = line.find(':') {
        let ssid = line[colon_pos + 1..].trim().to_string();
        if !ssid.is_empty() {
            return Ok(Some(WiFiNetwork {
                ssid,
                signal_strength: 0, // macOS doesn't easily provide signal strength
                security: "Unknown".to_string(),
            }));
        }
    }

    Ok(None)
}

#[cfg(target_os = "macos")]
fn disconnect_wifi_macos() -> Result<String, String> {
    // Use networksetup to disconnect
    let output = Command::new("networksetup")
        .args(&["-setairportpower", "en0", "off"])
        .output()
        .map_err(|e| format!("Failed to disconnect from WiFi: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Disconnect failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Turn WiFi back on but disconnected
    let _ = Command::new("networksetup")
        .args(&["-setairportpower", "en0", "on"])
        .output();

    Ok("Successfully disconnected from WiFi".to_string())
}


// Wifi and Access Point Controller
#[tauri::command]
pub async fn set_wifi(ssid: String) -> Result<String, String> {
    WiFiService::set_wifi(ssid).await
}
