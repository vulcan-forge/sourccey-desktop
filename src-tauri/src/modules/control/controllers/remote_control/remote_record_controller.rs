use crate::modules::control::services::remote_control::remote_record_service::{
    RemoteRecordProcess, RemoteRecordService,
};
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
    #[serde(default)]
    pub name_pattern: String,
    pub num_episodes: i32,
    pub episode_time_s: f64,
    pub reset_time_s: f64,
    pub single_task: String,
    #[serde(default)]
    pub vr_headset: bool,
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
    RemoteRecordService::stop_record(&app_handle, db_connection, &state, nickname)
}

#[command]
pub fn begin_vr_record(
    state: State<RemoteRecordProcess>,
    nickname: String,
    task: String,
    requested_at_ms: Option<u64>,
) -> Result<(), String> {
    RemoteRecordService::begin_vr_record(&state, &nickname, &task, requested_at_ms)
}

#[command]
pub fn update_vr_record_task(
    state: State<RemoteRecordProcess>,
    nickname: String,
    task: String,
) -> Result<(), String> {
    RemoteRecordService::update_vr_record_task(&state, &nickname, &task)
}

#[command]
pub fn stop_vr_capture(state: State<RemoteRecordProcess>, nickname: String) -> Result<(), String> {
    RemoteRecordService::stop_vr_capture(&state, &nickname)
}

#[command]
pub fn get_recording_host_ip(remote_ip: String) -> Result<String, String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0")
        .map_err(|error| format!("Could not inspect the desktop network: {error}"))?;
    socket
        .connect((remote_ip.trim(), 5555))
        .map_err(|error| format!("Could not find a route to the robot: {error}"))?;
    let address = socket
        .local_addr()
        .map_err(|error| format!("Could not read the desktop address: {error}"))?
        .ip();
    if !address.is_ipv4() || address.is_loopback() {
        return Err("No usable desktop IPv4 address is available for the headset.".to_string());
    }
    Ok(address.to_string())
}
