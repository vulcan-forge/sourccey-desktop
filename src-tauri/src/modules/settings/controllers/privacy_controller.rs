use crate::database::connection::DatabaseManager;
use crate::modules::settings::services::privacy_service::{
    PrivacyPreferences, PrivacyService, SavePrivacyPreferencesRequest,
};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn get_privacy_preferences(app_handle: AppHandle) -> Result<PrivacyPreferences, String> {
    let database = app_handle.state::<DatabaseManager>();
    PrivacyService::get(database.get_connection())
        .await
        .map_err(|error| format!("Failed to load privacy preferences: {error}"))
}

#[tauri::command]
pub async fn save_privacy_preferences(
    app_handle: AppHandle,
    preferences: SavePrivacyPreferencesRequest,
) -> Result<PrivacyPreferences, String> {
    let database = app_handle.state::<DatabaseManager>();
    PrivacyService::save(database.get_connection(), preferences)
        .await
        .map_err(|error| format!("Failed to save privacy preferences: {error}"))
}
