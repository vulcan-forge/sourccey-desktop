use crate::modules::control::services::local_control::teleop_service::{
    TeleopProcess, TeleopService,
};
use crate::services::camera::camera_service::CameraConfig;
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TeleopConfig {
    pub nickname: String,
    pub robot_port: String,
    pub teleop_port: String,
    pub camera_config: Option<CameraConfig>,
}

// Initialize the state
pub fn init_teleop() -> TeleopProcess {
    TeleopService::init_teleop()
}

#[command]
pub async fn start_teleop(
    app_handle: AppHandle,
    state: State<'_, TeleopProcess>,
    config: TeleopConfig,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    TeleopService::start_teleop(app_handle, db_connection, &state, config).await
}

#[command]
pub fn stop_teleop(
    app_handle: AppHandle,
    state: State<TeleopProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    TeleopService::stop_teleop(db_connection, &state, nickname)
}

#[command]
pub fn is_teleop_active(state: State<TeleopProcess>, nickname: String) -> bool {
    TeleopService::is_teleop_active(&state, nickname)
}

#[command]
pub fn get_active_teleop_sessions(state: State<TeleopProcess>) -> Vec<String> {
    TeleopService::get_active_teleop_sessions(&state)
}
