use crate::modules::control::services::configuration::configuration_service::ConfigurationService;
use crate::modules::control::types::configuration::configuration_types::{Config, RemoteConfig};

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
