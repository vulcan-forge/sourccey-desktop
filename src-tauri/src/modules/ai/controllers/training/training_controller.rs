use crate::modules::ai::services::training::training_service::{TrainingProcess, TrainingService};
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrainingConfig {
    pub repo_dir: String,
    pub dataset: String,
    pub policy_type: String,
    pub model_name: String,
    pub batch_size: i32,
    pub steps: i32,
    pub distributed_training: bool,
    pub num_gpus: i32,
}

// Initialize the state
pub fn init_training() -> TrainingProcess {
    TrainingService::init_training()
}

#[command]
pub async fn start_training(
    app_handle: AppHandle,
    state: State<'_, TrainingProcess>,
    config: TrainingConfig,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    TrainingService::start_training(app_handle, db_connection, &state, config).await
}

#[command]
pub fn stop_training(
    app_handle: AppHandle,
    state: State<TrainingProcess>,
    model_name: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    TrainingService::stop_training(db_connection, &state, model_name)
}

#[command]
pub fn training_exists(config: TrainingConfig) -> Result<bool, String> {
    let result = TrainingService::training_exists(config);
    result
}
