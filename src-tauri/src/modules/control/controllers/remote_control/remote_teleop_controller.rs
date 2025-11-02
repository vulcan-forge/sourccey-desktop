use crate::modules::control::services::remote_control::remote_teleop_service::{
    RemoteTeleopProcess, RemoteTeleopService,
};
use crate::services::camera::camera_service::CameraConfig;
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteTeleopConfig {
    pub nickname: String,
    pub remote_ip: String,
    pub left_arm_port: String,
    pub right_arm_port: String,
    pub keyboard: String,
    pub fps: i32,
}

// Initialize the state
pub fn init_remote_teleop() -> RemoteTeleopProcess {
    RemoteTeleopService::init_remote_teleop()
}

#[command]
pub async fn start_remote_teleop(
    app_handle: AppHandle,
    state: State<'_, RemoteTeleopProcess>,
    config: RemoteTeleopConfig,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    RemoteTeleopService::start_teleop(app_handle, db_connection, &state, config).await
}

#[command]
pub fn stop_remote_teleop(
    app_handle: AppHandle,
    state: State<RemoteTeleopProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    RemoteTeleopService::stop_teleop(db_connection, &state, nickname)
}
