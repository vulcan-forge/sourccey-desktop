use crate::modules::control::services::kiosk_control::pairing_service::{
    DiscoveredKioskRobot, KioskPairingInfo, KioskPairingService, KioskPairingState,
    PairWithKioskResult, DEFAULT_SERVICE_PORT,
};
use crate::services::directory::directory_service::DirectoryService;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{command, State};

pub fn init_kiosk_pairing() -> KioskPairingState {
    KioskPairingService::init_kiosk_pairing_state()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPairedRobotConnection {
    pub nickname: String,
    pub host: String,
    pub port: u16,
    pub token: String,
    pub robot_type: String,
    pub robot_name: String,
    pub paired_at: u64,
}

#[command]
pub fn get_saved_paired_robot_connections() -> Result<HashMap<String, DesktopPairedRobotConnection>, String> {
    load_desktop_paired_connections()
}

#[command]
pub fn upsert_paired_robot_connection(
    nickname: String,
    connection: DesktopPairedRobotConnection,
) -> Result<(), String> {
    let normalized_nickname = normalize_nickname(&nickname)?;
    validate_connection(&connection)?;

    let mut connections = load_desktop_paired_connections()?;
    let mut normalized_connection = connection;
    normalized_connection.nickname = normalized_nickname.clone();
    connections.insert(normalized_nickname, normalized_connection);
    save_desktop_paired_connections(&connections)
}

#[command]
pub fn remove_paired_robot_connection(nickname: String) -> Result<(), String> {
    let normalized_nickname = normalize_nickname(&nickname)?;
    let mut connections = load_desktop_paired_connections()?;
    connections.remove(&normalized_nickname);
    save_desktop_paired_connections(&connections)
}

#[command]
pub fn get_kiosk_pairing_info(state: State<'_, KioskPairingState>) -> Result<KioskPairingInfo, String> {
    KioskPairingService::get_kiosk_pairing_info(state.inner().clone())
}

#[command]
pub fn discover_pairable_robots(timeout_ms: Option<u64>) -> Result<Vec<DiscoveredKioskRobot>, String> {
    KioskPairingService::discover_pairable_robots(timeout_ms.unwrap_or(1200))
}

#[command]
pub fn pair_with_kiosk_robot(
    host: String,
    code: String,
    client_name: Option<String>,
) -> Result<PairWithKioskResult, String> {
    KioskPairingService::pair_with_kiosk_robot(&host, &code, &client_name.unwrap_or_else(|| "Desktop App".to_string()))
}

#[command]
pub fn request_kiosk_pairing_modal(host: String, port: Option<u16>) -> Result<String, String> {
    KioskPairingService::request_kiosk_pairing_modal(&host, port.unwrap_or(DEFAULT_SERVICE_PORT))
}

#[command]
pub fn send_model_to_kiosk_robot(
    host: String,
    port: Option<u16>,
    token: String,
    repo_id: String,
    model_name: String,
) -> Result<String, String> {
    KioskPairingService::send_model_to_kiosk_robot(
        &host,
        port.unwrap_or(DEFAULT_SERVICE_PORT),
        &token,
        &repo_id,
        &model_name,
    )
}

#[command]
pub fn check_kiosk_robot_connection(
    host: String,
    port: Option<u16>,
    token: String,
) -> Result<String, String> {
    KioskPairingService::check_kiosk_robot_connection(
        &host,
        port.unwrap_or(DEFAULT_SERVICE_PORT),
        &token,
    )
}

#[command]
pub fn start_kiosk_robot(
    host: String,
    port: Option<u16>,
    token: String,
) -> Result<String, String> {
    KioskPairingService::start_kiosk_robot(
        &host,
        port.unwrap_or(DEFAULT_SERVICE_PORT),
        &token,
    )
}

#[command]
pub fn stop_kiosk_robot(
    host: String,
    port: Option<u16>,
    token: String,
) -> Result<String, String> {
    KioskPairingService::stop_kiosk_robot(
        &host,
        port.unwrap_or(DEFAULT_SERVICE_PORT),
        &token,
    )
}

#[command]
pub fn get_kiosk_robot_status(
    host: String,
    port: Option<u16>,
    token: String,
) -> Result<String, String> {
    KioskPairingService::get_kiosk_robot_status(
        &host,
        port.unwrap_or(DEFAULT_SERVICE_PORT),
        &token,
    )
}

fn validate_connection(connection: &DesktopPairedRobotConnection) -> Result<(), String> {
    normalize_nickname(&connection.nickname)?;
    if connection.host.trim().is_empty() {
        return Err("Connection host cannot be empty".to_string());
    }
    if connection.token.trim().is_empty() {
        return Err("Connection token cannot be empty".to_string());
    }
    if connection.host.contains('\n')
        || connection.host.contains('\r')
        || connection.host.contains('\0')
        || connection.token.contains('\n')
        || connection.token.contains('\r')
        || connection.token.contains('\0')
    {
        return Err("Connection fields contain invalid control characters".to_string());
    }
    Ok(())
}

fn normalize_nickname(value: &str) -> Result<String, String> {
    let normalized = value.trim().trim_start_matches('@').trim();
    if normalized.is_empty() {
        return Err("Nickname cannot be empty".to_string());
    }
    if normalized.contains('/')
        || normalized.contains('\\')
        || normalized.contains('\n')
        || normalized.contains('\r')
        || normalized.contains('\0')
    {
        return Err("Nickname contains invalid characters".to_string());
    }
    Ok(normalized.to_string())
}

fn desktop_paired_connections_file_path() -> Result<PathBuf, String> {
    let cache_dir = DirectoryService::get_lerobot_cache_dir()?;
    Ok(cache_dir.join("pairing").join("desktop_paired_connections.json"))
}

fn load_desktop_paired_connections() -> Result<HashMap<String, DesktopPairedRobotConnection>, String> {
    let file_path = desktop_paired_connections_file_path()?;
    if !file_path.exists() {
        return Ok(HashMap::new());
    }

    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read paired connections {:?}: {}", file_path, e))?;
    serde_json::from_str::<HashMap<String, DesktopPairedRobotConnection>>(&content)
        .map_err(|e| format!("Failed to parse paired connections {:?}: {}", file_path, e))
}

fn save_desktop_paired_connections(connections: &HashMap<String, DesktopPairedRobotConnection>) -> Result<(), String> {
    let file_path = desktop_paired_connections_file_path()?;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create paired connections directory {:?}: {}", parent, e))?;
    }

    let serialized = serde_json::to_string_pretty(connections)
        .map_err(|e| format!("Failed to encode paired connections: {}", e))?;
    fs::write(&file_path, serialized)
        .map_err(|e| format!("Failed to write paired connections {:?}: {}", file_path, e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o600);
        fs::set_permissions(&file_path, perms)
            .map_err(|e| format!("Failed to secure paired connections file {:?}: {}", file_path, e))?;
    }

    Ok(())
}
