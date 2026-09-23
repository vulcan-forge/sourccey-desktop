use crate::modules::control::services::remote_control::remote_rollout_service::{
    RemoteRolloutProcess, RemoteRolloutService,
};
use crate::services::telemetry;
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::{AppHandle, Manager, State};

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteRolloutConfig {
    pub nickname: String,
    pub remote_ip: String,
    pub model_path: String,
    pub task: String,
    pub duration: f64,
    #[serde(default)]
    pub display_data: bool,
    #[serde(default = "default_true")]
    pub record_data: bool,
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
    let session_key = config.nickname.clone();
    let result =
        RemoteRolloutService::start_rollout(app_handle, db_connection, &state, config).await;
    if result.is_ok() {
        telemetry::control_started("rollout", &session_key);
    } else {
        telemetry::control_start_failed("rollout");
    }
    result
}

#[command]
pub fn stop_remote_rollout(
    app_handle: AppHandle,
    state: State<RemoteRolloutProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    let session_key = nickname.clone();
    let result = RemoteRolloutService::stop_rollout(&app_handle, db_connection, &state, nickname);
    if result.is_ok() {
        telemetry::control_finished("rollout", &session_key, "user_stopped");
    }
    result
}
