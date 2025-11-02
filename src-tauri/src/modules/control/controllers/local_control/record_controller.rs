use crate::modules::control::services::local_control::record_service::{
    RecordProcess, RecordService,
};
use crate::services::camera::camera_service::CameraConfig;
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Deserialize, Debug)]
pub struct RecordConfig {
    pub nickname: String,
    pub robot_port: String,
    pub teleop_port: String,
    pub camera_config: Option<CameraConfig>,
    pub dataset: RecordDatasetConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecordDatasetConfig {
    pub dataset: String,
    pub num_episodes: i32,
    pub episode_time_s: i32,
    pub reset_time_s: i32,
    pub task: String,
}

// Initialize the state
pub fn init_record() -> RecordProcess {
    RecordService::init_record()
}

#[command]
pub async fn start_record(
    app_handle: AppHandle,
    state: State<'_, RecordProcess>,
    config: RecordConfig,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    RecordService::start_record(app_handle, db_connection, &state, config).await
}

#[command]
pub fn stop_record(
    app_handle: AppHandle,
    state: State<RecordProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    RecordService::stop_record(db_connection, &state, nickname)
}

#[command]
pub fn save_record_episode(
    state: State<RecordProcess>,
    nickname: String,
) -> Result<String, String> {
    RecordService::save_record_episode(&state, nickname)
}

#[command]
pub fn reset_record_episode(
    state: State<RecordProcess>,
    nickname: String,
) -> Result<String, String> {
    RecordService::reset_record_episode(&state, nickname)
}
