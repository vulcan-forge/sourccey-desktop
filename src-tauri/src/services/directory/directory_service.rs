use std::path::PathBuf;
use crate::services::environment::build_service::BuildService;
use crate::services::directory::path_constants;

pub struct DirectoryService;

impl DirectoryService {
    //------------------------------------------------------------//
    // Standard Directory Functions
    //------------------------------------------------------------//
    pub fn get_current_dir() -> Result<PathBuf, String> {
        match BuildService::is_dev_mode() {
            true => Self::get_current_dir_dev(),
            false => Self::get_current_dir_production(),
        }
    }

    pub fn get_current_dir_dev() -> Result<PathBuf, String> {
        let current_dir = std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?
            .parent()
            .ok_or("Failed to get parent directory")?
            .to_path_buf();
        Ok(current_dir)
    }

    pub fn get_current_dir_production() -> Result<PathBuf, String> {
        // Production build: project is at fixed location where setup script was run
        let project_root = path_constants::get_project_root();

        // Verify modules exist at expected location
        if project_root.join("modules").join("lerobot-vulcan").exists() {
            Ok(project_root)
        } else {
            Err(format!(
                "Project root not found at expected location: {:?}. \
                Please verify modules/lerobot-vulcan directory exists.",
                project_root
            ))
        }
    }

    pub fn get_lerobot_vulcan_dir() -> Result<PathBuf, String> {
        let current_dir = Self::get_current_dir()?;
        let lerobot_vulcan_dir = current_dir.join("modules").join("lerobot-vulcan");
        Ok(lerobot_vulcan_dir)
    }

    pub fn get_lerobot_cache_dir() -> Result<PathBuf, String> {
        let home_dir = dirs::home_dir().ok_or("Could not determine home directory")?;

        Ok(home_dir.join(".cache").join("huggingface").join("lerobot"))
    }

    pub fn get_virtual_env_path() -> Result<PathBuf, String> {
        let virtual_env_path = Self::get_lerobot_vulcan_dir()?.join(".venv");
        Ok(virtual_env_path)
    }

    pub fn get_virtual_env_bin_path() -> Result<PathBuf, String> {
        let virtual_env_path = Self::get_virtual_env_path()?;
        #[cfg(windows)]
        let virtual_env_bin_path = virtual_env_path.join("Scripts");
        #[cfg(not(windows))]
        let virtual_env_bin_path = virtual_env_path.join("bin");
        Ok(virtual_env_bin_path)
    }

    pub fn get_python_path() -> Result<PathBuf, String> {
        let virtual_env_bin_path = Self::get_virtual_env_bin_path()?;
        #[cfg(windows)]
        let python_path = virtual_env_bin_path.join("python.exe");
        #[cfg(not(windows))]
        let python_path = virtual_env_bin_path.join("python");
        Ok(python_path)
    }

    pub fn get_ffmpeg_path() -> Result<PathBuf, String> {
        let ffmpeg_path = Self::get_current_dir()?
            .join("tools")
            .join("ffmpeg")
            .join("ffmpeg.exe");
        Ok(ffmpeg_path)
    }

    //------------------------------------------------------------//
    // Configuration Directory Functions
    //------------------------------------------------------------//
    pub fn get_robot_config_path(nickname: &str) -> Result<PathBuf, String> {
        let lerobot_cache_dir = Self::get_lerobot_cache_dir()?;
        Ok(lerobot_cache_dir.join(nickname).join("config.json"))
    }

    pub fn get_remote_config_path(nickname: &str) -> Result<PathBuf, String> {
        let lerobot_cache_dir = Self::get_lerobot_cache_dir()?;
        Ok(lerobot_cache_dir.join(nickname).join("remote_config.json"))
    }

    pub fn get_robot_calibration_path(nickname: &str) -> Result<PathBuf, String> {
        let lerobot_cache_dir = Self::get_lerobot_cache_dir()?;
        Ok(lerobot_cache_dir.join(nickname).join("calibration.json"))
    }

    //------------------------------------------------------------//
    // Dataset Directory Functions
    //------------------------------------------------------------//
    pub fn get_lerobot_repository_path(nickname: &str) -> Result<PathBuf, String> {
        let lerobot_cache_dir = Self::get_lerobot_cache_dir()?;
        Ok(lerobot_cache_dir.join(nickname))
    }

    pub fn get_lerobot_dataset_path(nickname: &str, dataset: &str) -> Result<PathBuf, String> {
        let lerobot_cache_dir = Self::get_lerobot_repository_path(nickname)?;
        Ok(lerobot_cache_dir.join(dataset))
    }

    pub fn get_lerobot_dataset_path_from_repo_id(repo_id: &str) -> Result<PathBuf, String> {
        let lerobot_cache_dir = Self::get_lerobot_cache_dir()?;
        Ok(lerobot_cache_dir.join(repo_id))
    }

    //------------------------------------------------------------//
    // AI Models Directory Functions
    //------------------------------------------------------------//
    pub fn get_lerobot_ai_models_path() -> Result<PathBuf, String> {
        let lerobot_cache_dir = Self::get_lerobot_cache_dir()?;
        Ok(lerobot_cache_dir.join("ai_models"))
    }

    pub fn get_lerobot_ai_model_repository_path(repo_id: &str) -> Result<PathBuf, String> {
        let lerobot_cache_dir = Self::get_lerobot_ai_models_path()?;
        Ok(lerobot_cache_dir.join(repo_id))
    }

    pub fn get_lerobot_ai_model_path(repo_id: &str, name: &str) -> Result<PathBuf, String> {
        let lerobot_cache_dir = Self::get_lerobot_ai_model_repository_path(repo_id)?;
        Ok(lerobot_cache_dir.join(name))
    }
}
