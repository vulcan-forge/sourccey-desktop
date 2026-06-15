use crate::modules::settings::services::desktop_environment::desktop_environment_service::{
    DesktopEnvironmentService, DesktopEnvironmentSettings,
    SaveDesktopEnvironmentSettingsRequest,
};

#[tauri::command]
pub fn get_desktop_environment_settings() -> Result<DesktopEnvironmentSettings, String> {
    DesktopEnvironmentService::get_settings()
}

#[tauri::command]
pub fn save_desktop_environment_settings(
    settings: SaveDesktopEnvironmentSettingsRequest,
) -> Result<DesktopEnvironmentSettings, String> {
    DesktopEnvironmentService::save_settings(settings)
}
