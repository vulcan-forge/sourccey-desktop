use crate::database::connection::DatabaseManager;
#[cfg(feature = "desktop")]
use crate::modules::dataset_sync::services::upload_service::UploadService;
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
    #[cfg(feature = "desktop")]
    let previous = PrivacyService::get(database.get_connection())
        .await
        .map_err(|error| format!("Failed to load previous privacy preferences: {error}"))?;
    let saved = PrivacyService::save(database.get_connection(), preferences)
        .await
        .map_err(|error| format!("Failed to save privacy preferences: {error}"))?;

    #[cfg(feature = "desktop")]
    {
        let should_report = previous.diagnostics_enabled
            || previous.dataset_metadata_enabled
            || saved.diagnostics_enabled
            || saved.dataset_metadata_enabled;
        if should_report {
            let connection = database.get_connection().clone();
            let registration_preferences = saved.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    UploadService::sync_registration(&connection, &registration_preferences).await
                {
                    eprintln!(
                        "Privacy preferences saved locally; cloud registration will retry: {error}"
                    );
                }
            });
        }
    }

    Ok(saved)
}
