use crate::modules::control::services::local_control::evaluate_service::{
    EvaluateProcess, EvaluateService,
};
use crate::modules::control::services::local_control::teleop_service::{
    TeleopProcess, TeleopService,
};
use crate::services::camera::camera_service::CameraConfig;
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EvaluateConfig {
    pub nickname: String,
    pub robot_port: String,
    pub camera_config: Option<CameraConfig>,
    pub model_name: String,
    pub model_steps: i32,
    pub dataset: EvaluateDatasetConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EvaluateDatasetConfig {
    pub dataset: String,
    pub num_episodes: i32,
    pub task: String,
    pub episode_time_s: i32,
    pub reset_time_s: i32,
}

// Initialize the state
pub fn init_evaluate() -> EvaluateProcess {
    EvaluateService::init_evaluate()
}

#[command]
pub async fn start_evaluate(
    app_handle: AppHandle,
    state: State<'_, EvaluateProcess>,
    config: EvaluateConfig,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    EvaluateService::start_evaluate(app_handle, db_connection, &state, config).await
}

#[command]
pub fn stop_evaluate(
    app_handle: AppHandle,
    state: State<EvaluateProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    EvaluateService::stop_evaluate(db_connection, &state, nickname)
}

#[command]
pub fn save_evaluate_episode(
    state: State<EvaluateProcess>,
    nickname: String,
) -> Result<String, String> {
    EvaluateService::save_evaluate_episode(&state, nickname)
}

#[command]
pub fn reset_evaluate_episode(
    state: State<EvaluateProcess>,
    nickname: String,
) -> Result<String, String> {
    EvaluateService::reset_evaluate_episode(&state, nickname)
}
