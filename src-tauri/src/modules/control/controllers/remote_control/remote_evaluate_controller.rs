use crate::modules::control::services::remote_control::remote_evaluate_service::{
    RemoteEvaluateProcess, RemoteEvaluateService,
};
use crate::services::camera::camera_service::CameraConfig;
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteEvaluateConfig {
    pub nickname: String,
    pub remote_ip: String,
    pub model_name: String,
    #[serde(default)]
    pub model_repo_id: Option<String>,
    #[serde(default)]
    pub model_path: Option<String>,
    pub model_steps: i32,
    pub dataset: RemoteEvaluateDatasetConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteEvaluateDatasetConfig {
    pub dataset: String,
    pub num_episodes: i32,
    pub episode_time_s: i32,
    pub reset_time_s: i32,
    pub task: String,
    pub fps: i32,
}

// Initialize the state
pub fn init_remote_evaluate() -> RemoteEvaluateProcess {
    RemoteEvaluateService::init_remote_evaluate()
}

#[command]
pub async fn start_remote_evaluate(
    app_handle: AppHandle,
    state: State<'_, RemoteEvaluateProcess>,
    config: RemoteEvaluateConfig,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    RemoteEvaluateService::start_evaluate(app_handle, db_connection, &state, config).await
}

#[command]
pub fn stop_remote_evaluate(
    app_handle: AppHandle,
    state: State<RemoteEvaluateProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    RemoteEvaluateService::stop_evaluate(db_connection, &state, nickname)
}

#[command]
pub fn save_remote_evaluate_episode(
    state: State<RemoteEvaluateProcess>,
    nickname: String,
) -> Result<String, String> {
    RemoteEvaluateService::save_evaluate_episode(&state, nickname)
}

#[command]
pub fn reset_remote_evaluate_episode(
    state: State<RemoteEvaluateProcess>,
    nickname: String,
) -> Result<String, String> {
    RemoteEvaluateService::reset_evaluate_episode(&state, nickname)
}
