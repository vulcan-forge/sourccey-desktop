use crate::modules::control::services::local_control::replay_service::{
    ReplayProcess, ReplayService,
};
use crate::services::camera::camera_service::CameraConfig;
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReplayConfig {
    pub nickname: String,
    pub robot_port: String,
    pub camera_config: Option<CameraConfig>,
    pub dataset: ReplayDatasetConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReplayDatasetConfig {
    pub dataset: String,
    pub episode_number: i32,
}

// Initialize the state
pub fn init_replay() -> ReplayProcess {
    ReplayService::init_replay()
}

#[command]
pub async fn start_replay(
    app_handle: AppHandle,
    state: State<'_, ReplayProcess>,
    config: ReplayConfig,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    ReplayService::start_replay(app_handle, db_connection, &state, config).await
}

#[command]
pub fn stop_replay(
    app_handle: AppHandle,
    state: State<ReplayProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    ReplayService::stop_replay(db_connection, &state, nickname)
}
