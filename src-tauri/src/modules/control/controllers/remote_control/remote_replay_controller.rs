use crate::modules::control::services::remote_control::remote_replay_service::{
    RemoteReplayProcess, RemoteReplayService,
};
use crate::services::camera::camera_service::CameraConfig;
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteReplayConfig {
    pub nickname: String,
    pub remote_ip: String,
    pub dataset: RemoteReplayDatasetConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteReplayDatasetConfig {
    pub dataset: String,
    pub episode: i32,
    pub fps: i32,
}

// Initialize the state
pub fn init_remote_replay() -> RemoteReplayProcess {
    RemoteReplayService::init_remote_replay()
}

#[command]
pub async fn start_remote_replay(
    app_handle: AppHandle,
    state: State<'_, RemoteReplayProcess>,
    config: RemoteReplayConfig,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    RemoteReplayService::start_replay(app_handle, db_connection, &state, config).await
}

#[command]
pub fn stop_remote_replay(
    app_handle: AppHandle,
    state: State<RemoteReplayProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    RemoteReplayService::stop_replay(db_connection, &state, nickname)
}
