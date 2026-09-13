use crate::modules::log::services::command_log_service::CommandLogService;
use crate::services::directory::directory_service::DirectoryService;
use crate::services::log::log_service::LogService;
use crate::services::setup::local_setup_service::LocalSetupService;
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
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
        return Err(format!(
            "lerobot-vulcan runtime directory not found at: {:?}",
            lerobot_dir
        ));
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

pub fn validate_rollout_model_path(model_path: &str) -> Result<(), String> {
    let model_path = model_path.trim();
    let path = Path::new(model_path);

    if path.is_absolute() && !path.exists() {
        return Err(format!(
            "The selected local model path does not exist: {}. Refresh AI Models and select the model again.",
            model_path
        ));
    }
    if model_path.contains('\\') && !path.is_absolute() {
        return Err(format!(
            "The selected model uses a relative Windows path: {}. Rollout requires the absolute local model path.",
            model_path
        ));
    }

    Ok(())
}

pub fn resolve_policy_model_path(model_path: &str, working_dir: &Path) -> Result<String, String> {
    validate_rollout_model_path(model_path)?;
    let supplied = Path::new(model_path.trim());
    let local_path = if supplied.is_absolute() {
        supplied.to_path_buf()
    } else {
        working_dir.join(supplied)
    };

    if !local_path.is_dir() {
        // A non-local value is a Hugging Face repository ID and is resolved by LeRobot.
        return Ok(model_path.trim().to_string());
    }

    let mut candidates = vec![local_path.clone(), local_path.join("pretrained_model")];
    let checkpoints = local_path.join("checkpoints");
    if let Ok(entries) = std::fs::read_dir(&checkpoints) {
        let mut numbered = entries
            .flatten()
            .filter_map(|entry| {
                let step = entry.file_name().to_string_lossy().parse::<u64>().ok()?;
                entry.path().is_dir().then_some((step, entry.path()))
            })
            .collect::<Vec<_>>();
        numbered.sort_by(|left, right| right.0.cmp(&left.0));
        candidates.extend(
            numbered
                .into_iter()
                .map(|(_, checkpoint)| checkpoint.join("pretrained_model")),
        );
    }

    for candidate in candidates {
        let config_path = candidate.join("config.json");
        let Ok(metadata) = std::fs::metadata(&config_path) else {
            continue;
        };
        if !metadata.is_file() || metadata.len() > 1024 * 1024 {
            continue;
        }
        let bytes = std::fs::read(&config_path).map_err(|error| {
            format!(
                "Failed to read policy config {}: {error}",
                config_path.display()
            )
        })?;
        let config: serde_json::Value = serde_json::from_slice(&bytes).map_err(|error| {
            format!(
                "Policy config {} is invalid JSON: {error}",
                config_path.display()
            )
        })?;
        if config
            .get("type")
            .and_then(serde_json::Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
        {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }

    Err(format!(
        "No valid pretrained policy was found under {}. Expected config.json with a non-empty 'type', usually in checkpoints/<step>/pretrained_model.",
        local_path.display()
    ))
}

#[cfg(test)]
mod tests {
    use super::{resolve_policy_model_path, validate_rollout_model_path};
    use std::path::Path;

    #[test]
    fn rejects_relative_windows_model_paths_before_hugging_face_parsing() {
        let error = validate_rollout_model_path("test-shorts-fold\\xvla__sourccey-012")
            .expect_err("relative Windows paths must be rejected");
        assert!(error.contains("absolute local model path"));
    }

    #[test]
    fn accepts_hugging_face_repo_ids() {
        assert!(validate_rollout_model_path("vulcan-forge/xvla-sourccey").is_ok());
    }

    #[test]
    fn resolves_latest_pretrained_checkpoint() {
        let root =
            std::env::temp_dir().join(format!("vulcan-policy-resolution-{}", std::process::id()));
        let older = root
            .join("checkpoints")
            .join("000400")
            .join("pretrained_model");
        let latest = root
            .join("checkpoints")
            .join("100000")
            .join("pretrained_model");
        std::fs::create_dir_all(&older).unwrap();
        std::fs::create_dir_all(&latest).unwrap();
        std::fs::write(older.join("config.json"), r#"{"type":"act"}"#).unwrap();
        std::fs::write(latest.join("config.json"), r#"{"type":"xvla"}"#).unwrap();

        let resolved = resolve_policy_model_path(root.to_str().unwrap(), Path::new(".")).unwrap();
        assert_eq!(Path::new(&resolved), latest);
        std::fs::remove_dir_all(root).unwrap();
    }
}
