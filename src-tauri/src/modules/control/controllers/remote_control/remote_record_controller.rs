use crate::modules::control::services::remote_control::remote_record_service::{
    RemoteRecordProcess, RemoteRecordService,
};
use crate::services::telemetry;
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteRecordConfig {
    pub robot_id: String,
    pub nickname: String,
    pub remote_ip: String,
    pub left_arm_port: String,
    pub right_arm_port: String,
    pub keyboard: String,
    pub repo_id: String,
    pub num_episodes: i32,
    pub episode_time_s: f64,
    pub reset_time_s: f64,
    pub single_task: String,
    #[serde(default)]
    pub display_data: bool,
}

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
    let session_key = config.nickname.clone();
    let result = RemoteRecordService::start_record(app_handle, db_connection, &state, config).await;
    if result.is_ok() {
        telemetry::control_started("recording", &session_key);
    } else {
        telemetry::control_start_failed("recording");
    }
    result
}

#[command]
pub fn stop_remote_record(
    app_handle: AppHandle,
    state: State<RemoteRecordProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    let session_key = nickname.clone();
    let result = RemoteRecordService::stop_record(&app_handle, db_connection, &state, nickname);
    if result.is_ok() {
        telemetry::control_finished("recording", &session_key, "user_stopped");
    }
    result
}
