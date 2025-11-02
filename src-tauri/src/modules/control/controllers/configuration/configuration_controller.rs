use crate::modules::control::services::configuration::configuration_service::ConfigurationService;
use crate::modules::control::types::configuration::configuration_types::{
    Config, ConfigConfig, RemoteConfig,
};
use crate::modules::control::types::configuration::calibration_types::{
    Calibration, MotorCalibration
};
use serde_json::Value;
use tauri::{AppHandle, Manager};

//----------------------------------------------------------//
// Configuration Functions
//----------------------------------------------------------//
#[tauri::command]
pub fn read_config(nickname: String) -> Result<Config, String> {
    ConfigurationService::read_config(&nickname)
}

#[tauri::command]
pub fn write_config(nickname: String, config: Config) -> Result<(), String> {
    ConfigurationService::write_config(&nickname, config)
}

#[tauri::command]
pub async fn detect_config(app_handle: AppHandle, config: ConfigConfig) -> Result<Value, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    ConfigurationService::detect_config(db_connection, config).await
}

//----------------------------------------------------------//
// Remote Configuration Functions
//----------------------------------------------------------//
#[tauri::command]
pub fn read_remote_config(nickname: String) -> Result<RemoteConfig, String> {
    ConfigurationService::read_remote_config(&nickname)
}

#[tauri::command]
pub fn write_remote_config(nickname: String, config: RemoteConfig) -> Result<(), String> {
    ConfigurationService::write_remote_config(&nickname, config)
}

