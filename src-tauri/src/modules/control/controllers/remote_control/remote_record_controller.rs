use crate::modules::control::services::remote_control::remote_record_service::{
    RemoteRecordProcess, RemoteRecordService,
};
use crate::services::camera::camera_service::CameraConfig;
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteRecordConfig {
    pub nickname: String,
    pub remote_ip: String,
    pub left_arm_port: String,
    pub right_arm_port: String,
    pub keyboard: String,
    pub dataset: RemoteRecordDatasetConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteRecordDatasetConfig {
    pub dataset: String,
    pub num_episodes: i32,
    pub episode_time_s: i32,
    pub reset_time_s: i32,
    pub task: String,
    pub fps: i32,
}

// Initialize the state
pub fn init_remote_record() -> RemoteRecordProcess {
    RemoteRecordService::init_remote_record()
}

#[command]
pub async fn start_remote_record(
    app_handle: AppHandle,
    state: State<'_, RemoteRecordProcess>,
    config: RemoteRecordConfig,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    RemoteRecordService::start_record(app_handle, db_connection, &state, config).await
}

#[command]
pub fn stop_remote_record(
    app_handle: AppHandle,
    state: State<RemoteRecordProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    RemoteRecordService::stop_record(db_connection, &state, nickname)
}

#[command]
pub fn save_remote_record_episode(
    state: State<RemoteRecordProcess>,
    nickname: String,
) -> Result<String, String> {
    RemoteRecordService::save_record_episode(&state, nickname)
}

#[command]
pub fn reset_remote_record_episode(
    state: State<RemoteRecordProcess>,
    nickname: String,
) -> Result<String, String> {
    RemoteRecordService::reset_record_episode(&state, nickname)
}
