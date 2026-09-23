use crate::modules::control::services::remote_control::remote_teleop_service::{
    RemoteTeleopProcess, RemoteTeleopService,
};
use crate::services::telemetry;
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
    #[serde(default)]
    pub display_data: bool,
}

#[command]
pub fn set_remote_teleop_keys(nickname: String, keys: Vec<String>) -> Result<(), String> {
    RemoteTeleopService::update_keyboard_state(&nickname, &keys)
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
    let session_key = config.nickname.clone();
    let result = RemoteTeleopService::start_teleop(app_handle, db_connection, &state, config).await;
    if result.is_ok() {
        telemetry::control_started("teleop", &session_key);
    } else {
        telemetry::control_start_failed("teleop");
    }
    result
}

#[command]
pub fn stop_remote_teleop(
    app_handle: AppHandle,
    state: State<RemoteTeleopProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    let session_key = nickname.clone();
    let result = RemoteTeleopService::stop_teleop(&app_handle, db_connection, &state, nickname);
    if result.is_ok() {
        telemetry::control_finished("teleop", &session_key, "user_stopped");
    }
    result
}
