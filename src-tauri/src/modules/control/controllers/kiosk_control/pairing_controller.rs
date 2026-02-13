use crate::modules::control::services::kiosk_control::pairing_service::{
    DiscoveredKioskRobot, KioskPairingInfo, KioskPairingService, KioskPairingState,
    PairWithKioskResult, DEFAULT_SERVICE_PORT,
};
use tauri::{command, State};

pub fn init_kiosk_pairing() -> KioskPairingState {
    KioskPairingService::init_kiosk_pairing_state()
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
