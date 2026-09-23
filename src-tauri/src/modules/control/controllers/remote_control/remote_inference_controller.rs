use crate::modules::control::services::remote_control::remote_inference_service::{
    RemoteInferenceProcess, RemoteInferenceService,
};
use crate::services::telemetry;
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteInferenceConfig {
    pub nickname: String,
    pub remote_ip: String,
    pub model_path: String,
    pub single_task: String,
    pub fps: i32,
    pub episode_time_s: Option<f64>,
    pub display_data: bool,
    pub display_ip: Option<String>,
    pub display_port: Option<i32>,
    pub display_compressed_images: bool,
}

// Initialize the state
pub fn init_remote_inference() -> RemoteInferenceProcess {
    RemoteInferenceService::init_remote_inference()
}

#[command]
pub async fn start_remote_inference(
    app_handle: AppHandle,
    state: State<'_, RemoteInferenceProcess>,
    config: RemoteInferenceConfig,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    let session_key = config.nickname.clone();
    let result =
        RemoteInferenceService::start_inference(app_handle, db_connection, &state, config).await;
    if result.is_ok() {
        telemetry::control_started("inference", &session_key);
    } else {
        telemetry::control_start_failed("inference");
    }
    result
}

#[command]
pub fn stop_remote_inference(
    app_handle: AppHandle,
    state: State<RemoteInferenceProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    let session_key = nickname.clone();
    let result =
        RemoteInferenceService::stop_inference(&app_handle, db_connection, &state, nickname);
    if result.is_ok() {
        telemetry::control_finished("inference", &session_key, "user_stopped");
    }
    result
}
