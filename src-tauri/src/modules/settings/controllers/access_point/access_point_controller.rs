use crate::modules::settings::services::access_point::access_point_service::AccessPointService;
use crate::modules::control::types::configuration::configuration_types::RemoteConfig;
use tauri::AppHandle;

// Wifi and Access Point Controller
#[tauri::command]
pub async fn set_access_point(app_handle: AppHandle,config: RemoteConfig, ssid: String, password: String) -> Result<String, String> {
    AccessPointService::set_access_point(app_handle, &config, ssid, password).await
}
