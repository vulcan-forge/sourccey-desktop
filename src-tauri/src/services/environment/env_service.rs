use crate::services::directory::directory_service::DirectoryService;
use std::path::PathBuf;
use std::process::Command;

pub struct EnvService;

impl EnvService {
    pub fn add_python_env_vars(cmd: &mut Command) -> Result<(), String> {
        Self::add_parent_env_vars(cmd)?;
        Self::add_virtual_env_vars(cmd)?;
        Self::add_display_env_vars(cmd)?;
        Ok(())
    }

    pub fn add_parent_env_vars(cmd: &mut Command) -> Result<(), String> {
        cmd.envs(std::env::vars());
        Ok(())
    }

    pub fn add_virtual_env_vars(cmd: &mut Command) -> Result<(), String> {
        let venv_path = DirectoryService::get_virtual_env_path()?;
        cmd.env("VIRTUAL_ENV", &venv_path);

        let venv_bin_path = DirectoryService::get_virtual_env_bin_path()?
            .display()
            .to_string();
        cmd.env(
            "PATH",
            format!(
                "{};{}",
                venv_bin_path,
                std::env::var("PATH").unwrap_or_default()
            ),
        );

        Ok(())
    }

    pub fn add_display_env_vars(cmd: &mut Command) -> Result<(), String> {
        // Set DISPLAY for X11 forwarding (useful for GUI applications)
        cmd.env("DISPLAY", ":0");
        Ok(())
    }

    pub fn add_hide_warnings_env_vars(cmd: &mut Command) -> Result<(), String> {
        cmd.env("PYTHONWARNINGS", "ignore");
        Ok(())
    }
}
