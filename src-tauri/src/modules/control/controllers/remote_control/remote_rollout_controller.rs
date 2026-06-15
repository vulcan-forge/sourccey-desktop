use crate::modules::control::services::remote_control::remote_rollout_service::{
    RemoteRolloutProcess, RemoteRolloutService,
};
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteRolloutConfig {
    pub nickname: String,
    pub remote_ip: String,
    pub model_path: String,
    pub task: String,
    pub duration: f64,
}

pub fn init_remote_rollout() -> RemoteRolloutProcess {
    RemoteRolloutService::init_remote_rollout()
}

#[command]
pub async fn start_remote_rollout(
    app_handle: AppHandle,
    state: State<'_, RemoteRolloutProcess>,
    config: RemoteRolloutConfig,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    RemoteRolloutService::start_rollout(app_handle, db_connection, &state, config).await
}

#[command]
pub fn stop_remote_rollout(
    app_handle: AppHandle,
    state: State<RemoteRolloutProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    RemoteRolloutService::stop_rollout(&app_handle, db_connection, &state, nickname)
}
