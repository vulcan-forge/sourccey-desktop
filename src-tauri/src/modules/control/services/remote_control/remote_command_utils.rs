use crate::modules::log::services::command_log_service::CommandLogService;
use crate::services::directory::directory_service::DirectoryService;
use crate::services::log::log_service::LogService;
use crate::services::setup::local_setup_service::LocalSetupService;
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri_plugin_shell::process::CommandChild;

pub type ManagedRemoteProcesses =
    Arc<Mutex<HashMap<String, (CommandChild, Arc<AtomicBool>, String)>>>;

pub struct RemoteCommandRuntime {
    pub executable: String,
    pub working_dir: String,
    pub envs: HashMap<String, String>,
}

pub fn init_managed_processes() -> ManagedRemoteProcesses {
    Arc::new(Mutex::new(HashMap::new()))
}

pub fn resolve_uv_runtime(app_handle: &AppHandle) -> Result<RemoteCommandRuntime, String> {
    let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
    if !lerobot_dir.exists() {
        return Err(format!("LeRobot directory not found at: {:?}", lerobot_dir));
    }

    let uv_path = LocalSetupService::resolve_uv_binary(app_handle)?;
    Ok(RemoteCommandRuntime {
        executable: uv_path.to_string_lossy().to_string(),
        working_dir: lerobot_dir.to_string_lossy().to_string(),
        envs: build_remote_envs()?,
    })
}

pub fn build_remote_envs() -> Result<HashMap<String, String>, String> {
    let mut envs: HashMap<String, String> = std::env::vars().collect();
    let venv_path = DirectoryService::get_virtual_env_path()?;
    envs.insert(
        "VIRTUAL_ENV".to_string(),
        venv_path.to_string_lossy().to_string(),
    );

    let venv_bin_path = DirectoryService::get_virtual_env_bin_path()?
        .display()
        .to_string();
    let separator = if cfg!(windows) { ";" } else { ":" };
    let base_path = std::env::var("PATH").unwrap_or_default();
    envs.insert(
        "PATH".to_string(),
        format!("{}{}{}", venv_bin_path, separator, base_path),
    );

    envs.insert("DISPLAY".to_string(), ":0".to_string());
    Ok(envs)
}

pub async fn create_command_log(
    db_connection: DatabaseConnection,
    command_string: &str,
    command_type: &str,
    nickname: &str,
    log_name: &str,
) -> Result<String, String> {
    let command_log_service = CommandLogService::new(db_connection);
    let command_log = command_log_service
        .add_robot_command_log(
            command_string,
            Some(command_type.to_string()),
            Some(nickname.to_string()),
        )
        .await
        .map_err(|e| {
            let message = format!("Failed to add command log: {}", e);
            write_process_log(log_name, &message);
            message
        })?;

    Ok(command_log.id.clone())
}

pub fn process_log_path(log_name: &str) -> Result<PathBuf, String> {
    let base_dir = DirectoryService::get_current_dir()?;
    Ok(base_dir.join("logs").join(format!("{}.log", log_name)))
}

pub fn write_process_log(log_name: &str, message: &str) {
    if let Ok(path) = process_log_path(log_name) {
        LogService::write_log_line(path.to_string_lossy().as_ref(), Some(log_name), message);
    }
}

pub fn format_command_for_display(command_args: &[String]) -> String {
    std::iter::once("uv".to_string())
        .chain(command_args.iter().cloned())
        .collect::<Vec<_>>()
        .join(" ")
}
