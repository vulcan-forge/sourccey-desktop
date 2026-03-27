use crate::modules::control::services::kiosk_control::manual_drive_service::{
    KioskManualDriveProcess, KioskManualDriveService,
};
use tauri::{command, AppHandle, State};

pub fn init_kiosk_manual_drive() -> KioskManualDriveProcess {
    KioskManualDriveService::init_kiosk_manual_drive()
}

#[command]
pub async fn start_kiosk_manual_drive(
    app_handle: AppHandle,
    state: State<'_, KioskManualDriveProcess>,
    nickname: String,
) -> Result<String, String> {
    KioskManualDriveService::start_kiosk_manual_drive(app_handle, &state, nickname).await
}

#[command]
pub fn set_kiosk_manual_drive_keys(
    state: State<'_, KioskManualDriveProcess>,
    nickname: String,
    keys: Vec<String>,
) -> Result<(), String> {
    KioskManualDriveService::set_kiosk_manual_drive_keys(&state, nickname, keys)
}

#[command]
pub fn stop_kiosk_manual_drive(
    state: State<'_, KioskManualDriveProcess>,
    nickname: String,
) -> Result<String, String> {
    KioskManualDriveService::stop_kiosk_manual_drive(&state, nickname)
}

