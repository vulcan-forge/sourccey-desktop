use crate::modules::control::services::communication::ssh_service::{
    RobotProcesses, VoiceProcesses, SshService, SshSessions,
};
use crate::modules::control::types::configuration::configuration_types::RemoteConfig;
use tauri::{command, AppHandle, State};

// Initialize the state
pub fn init_ssh() -> SshSessions {
    SshService::init_ssh()
}

pub fn init_robot_processes() -> RobotProcesses {
    SshService::init_robot_processes()
}

pub fn init_voice_processes() -> VoiceProcesses {
    SshService::init_voice_processes()
}

#[command]
pub async fn connect(
    app_handle: AppHandle,
    state_sessions: State<'_, SshSessions>,
    config: RemoteConfig,
    nickname: String,
) -> Result<bool, String> {
    SshService::connect(app_handle, &state_sessions, &config, &nickname).await
}

#[command]
pub async fn disconnect(
    state_sessions: State<'_, SshSessions>,
    state_processes: State<'_, RobotProcesses>,
    config: RemoteConfig,
    nickname: String,
) -> Result<bool, String> {
    SshService::disconnect(&state_sessions, &state_processes, &config, &nickname).await
}

#[command]
pub async fn is_connected(
    app_handle: AppHandle,
    state_sessions: State<'_, SshSessions>,
    config: RemoteConfig,
    nickname: String,
) -> Result<bool, String> {
    SshService::is_connected(app_handle, &state_sessions, &config, &nickname).await
}

#[command]
pub async fn start_robot(
    app_handle: AppHandle,
    state_sessions: State<'_, SshSessions>,
    state_processes: State<'_, RobotProcesses>,
    config: RemoteConfig,
    nickname: String,
) -> Result<bool, String> {
    SshService::start_robot(app_handle, &state_sessions, &state_processes, &config, &nickname).await
}

#[command]
pub async fn stop_robot(
    app_handle: AppHandle,
    state_sessions: State<'_, SshSessions>,
    state_processes: State<'_, RobotProcesses>,
    config: RemoteConfig,
    nickname: String,
) -> Result<bool, String> {
    SshService::stop_robot(app_handle, &state_sessions, &state_processes, &config, &nickname).await
}

#[command]
pub async fn is_robot_started(
    app_handle: AppHandle,
    state_sessions: State<'_, SshSessions>,
    config: RemoteConfig,
    nickname: String,
) -> Result<bool, String> {
    SshService::is_robot_started(app_handle, &state_sessions, &config, &nickname).await
}

#[command]
pub async fn start_voice_listener(
    app_handle: AppHandle,
    state_sessions: State<'_, SshSessions>,
    state_voice_processes: State<'_, VoiceProcesses>,
    config: RemoteConfig,
    nickname: String,
) -> Result<bool, String> {
    SshService::start_voice_listener(app_handle, &state_sessions, &state_voice_processes, &config, &nickname).await
}

#[command]
pub async fn stop_voice_listener(
    app_handle: AppHandle,
    state_sessions: State<'_, SshSessions>,
    state_voice_processes: State<'_, VoiceProcesses>,
    config: RemoteConfig,
    nickname: String,
) -> Result<bool, String> {
    SshService::stop_voice_listener(app_handle, &state_sessions, &state_voice_processes, &config, &nickname).await
}

#[command]
pub async fn is_voice_listener_started(
    app_handle: AppHandle,
    state_sessions: State<'_, SshSessions>,
    config: RemoteConfig,
    nickname: String,
) -> Result<bool, String> {
    SshService::is_voice_listener_started(app_handle, &state_sessions, &config, &nickname).await
}
