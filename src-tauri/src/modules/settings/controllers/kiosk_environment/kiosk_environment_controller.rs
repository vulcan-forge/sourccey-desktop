use crate::modules::settings::services::kiosk_environment::kiosk_environment_service::{
    KioskEnvironmentService, KioskEnvironmentSettings, SaveKioskEnvironmentSettingsRequest,
};

#[tauri::command]
pub fn get_kiosk_environment_settings() -> Result<KioskEnvironmentSettings, String> {
    KioskEnvironmentService::get_settings()
}

#[tauri::command]
pub fn save_kiosk_environment_settings(
    settings: SaveKioskEnvironmentSettingsRequest,
) -> Result<KioskEnvironmentSettings, String> {
    KioskEnvironmentService::save_settings(settings)
}
