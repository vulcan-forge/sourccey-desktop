use crate::modules::settings::services::access_point::access_point_service::AccessPointService;

// Wifi and Access Point Controller
#[tauri::command]
pub async fn set_access_point(ssid: String, password: String) -> Result<Option<String>, String> {
    AccessPointService::set_access_point(ssid, password).await
}

#[tauri::command]
pub async fn is_access_point_active() -> Result<bool, String> {
    AccessPointService::is_access_point_active().await
}
