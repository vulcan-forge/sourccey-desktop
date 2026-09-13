use crate::modules::control::services::remote_control::remote_replay_service::{
    RemoteReplayProcess, RemoteReplayService,
};
use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteReplayConfig {
    pub nickname: String,
    pub remote_ip: String,
    pub repo_id: String,
    #[serde(default)]
    pub root: Option<String>,
    pub episode: i64,
    pub fps: i32,
    #[serde(default = "default_true")]
    pub play_sounds: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReplayDatasetSummary {
    pub name: String,
    pub repo_id: String,
    pub path: String,
    pub created_at_ms: Option<u64>,
    pub total_episodes: u64,
    pub total_frames: u64,
}

pub fn init_remote_replay() -> RemoteReplayProcess {
    RemoteReplayService::init_remote_replay()
}

#[command]
pub fn discover_replay_datasets() -> Result<Vec<ReplayDatasetSummary>, String> {
    RemoteReplayService::discover_datasets()
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
    state: State<'_, RemoteReplayProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    RemoteReplayService::stop_replay(&app_handle, db_connection, &state, nickname)
}
