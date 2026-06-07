use crate::modules::control::services::kiosk_control::pairing_service::{
    KioskCloudPairingInfo, KioskPairingService, KioskPairingState,
};
use tauri::{command, State};

pub fn init_kiosk_pairing() -> KioskPairingState {
    KioskPairingService::init_kiosk_pairing_state()
}

#[command]
pub fn get_kiosk_cloud_pairing_info(
    state: State<'_, KioskPairingState>,
) -> Result<KioskCloudPairingInfo, String> {
    KioskPairingService::get_kiosk_cloud_pairing_info(state.inner().clone())
}

#[command]
pub fn get_kiosk_cloud_pairing_status(
    state: State<'_, KioskPairingState>,
) -> Result<KioskCloudPairingInfo, String> {
    KioskPairingService::get_kiosk_cloud_pairing_status(state.inner().clone())
}
