
use crate::modules::control::types::configuration::configuration_types::{
    Config, ConfigConfig, RemoteConfig,
};
use crate::modules::control::types::configuration::calibration_types::{
    Calibration, MotorCalibration
};
use crate::modules::control::controllers::configuration::calibration_controller::{
    CalibrationConfig, RemoteCalibrationConfig
};
use crate::modules::log::services::command_log_service::CommandLogService;
use crate::services::directory::directory_service::DirectoryService;
use crate::services::process::process_service::ProcessService;
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::Command;

pub struct ConfigurationService;

impl ConfigurationService {
    //----------------------------------------------------------//
    // Configuration Functions
    //----------------------------------------------------------//

    /// Read configuration from file
    pub fn read_config(nickname: &str) -> Result<Config, String> {
        let config_path = DirectoryService::get_robot_config_path(nickname)?;

        // Create the config directory if it doesn't exist
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // If config file doesn't exist, create it with default values
        if !config_path.exists() {
            let default_config = Self::create_default_config();
            Self::write_config(nickname, default_config.clone())?;
            return Ok(default_config);
        }

        // Read and parse the existing config file
        let config_str = fs::read_to_string(config_path).map_err(|e| e.to_string())?;

        // Parse the JSON string into our Config struct
        let config: Config = serde_json::from_str(&config_str)
            .map_err(|e| format!("Failed to parse config file: {}", e))?;

        Ok(config)
    }

    /// Write configuration to file
    pub fn write_config(nickname: &str, config: Config) -> Result<(), String> {
        let config_path = DirectoryService::get_robot_config_path(nickname)?;

        // Create the config directory if it doesn't exist
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let config_str = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        fs::write(config_path, config_str).map_err(|e| e.to_string())
    }

    /// Create default configuration
    fn create_default_config() -> Config {
        let create_default_arm =
            |port: &str| crate::modules::control::types::configuration::configuration_types::Arm {
                port: port.to_string(),
            };

        // Create HashMaps for arms
        let mut leader_arms = std::collections::HashMap::new();
        let mut follower_arms = std::collections::HashMap::new();

        // Add default leader arms
        leader_arms.insert("main".to_string(), create_default_arm("COM18"));

        // Add default follower arms
        follower_arms.insert("main".to_string(), create_default_arm("COM21"));

        // Create cameras HashMap
        let mut cameras = std::collections::HashMap::new();
        cameras.insert(
            "main".to_string(),
            crate::modules::control::types::configuration::configuration_types::Camera {
                camera_type: "opencv".to_string(),
                camera_index: 0,
                fps: 30,
                width: 640,
                height: 480,
                color_mode: "rgb".to_string(),
            },
        );

        Config {
            leader_arms,
            follower_arms,
            cameras,
        }
    }

    /// Detect the configuration
    pub async fn detect_config(
        db_connection: DatabaseConnection,
        config: ConfigConfig,
    ) -> Result<serde_json::Value, String> {
        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;

        let mut command_parts = vec!["python".to_string()];
        command_parts.push("src/lerobot/scripts/sourccey/configuration/auto_config.py".to_string());

        let mut cmd = Command::new(python_path);
        for arg in &command_parts[1..] {
            cmd.arg(arg);
        }

        let child = cmd
            .current_dir(&lerobot_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to detect config: {}", e))?;
        let pid = child.id();

        // Create command log service with the provided connection
        let command_string = command_parts.join(" ");
        let command_log_service = CommandLogService::new(db_connection.clone());
        let command_log = match command_log_service
            .add_robot_command_log(
                &command_string,
                Some(config.robot_type.clone()),
                Some(config.nickname.clone()),
            )
            .await
        {
            Ok(log) => log,
            Err(e) => {
                eprintln!("Failed to add command log: {}", e);
                return Err(format!("Failed to add command log: {}", e));
            }
        };
        let command_log_id = command_log.id.clone();

        // Wait for the process to complete and capture output
        let output = child
            .wait_with_output()
            .await
            .map_err(|e| format!("Failed to get output: {}", e))?;

        // Check if the process was successful
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if let Some(pid_value) = pid {
                ProcessService::on_process_shutdown(pid_value, db_connection, command_log_id);
            }
            return Err(format!("Python script failed: {}", stderr));
        }

        // Parse the JSON output from stdout
        let stdout = String::from_utf8_lossy(&output.stdout);
        let com_ports: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|e| format!("Failed to parse JSON output: {}", e))?;

        if let Some(pid_value) = pid {
            ProcessService::on_process_shutdown(pid_value, db_connection, command_log_id);
        }
        Ok(com_ports)
    }

    //----------------------------------------------------------//
    // Remote Configuration Functions
    //----------------------------------------------------------//
    pub fn read_remote_config(nickname: &str) -> Result<RemoteConfig, String> {
        let config_path = DirectoryService::get_remote_config_path(nickname)?;

        // Create the config directory if it doesn't exist
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // If config file doesn't exist, create it with default values
        if !config_path.exists() {
            let default_config = Self::create_default_remote_config();
            Self::write_remote_config(nickname, default_config.clone())?;
            return Ok(default_config);
        }

        // Read and parse the existing config file
        let config_str = fs::read_to_string(config_path).map_err(|e| e.to_string())?;

        // Parse the JSON string into our Config struct
        let config: RemoteConfig = serde_json::from_str(&config_str)
            .map_err(|e| format!("Failed to parse config file: {}", e))?;

        Ok(config)
    }

    pub fn write_remote_config(nickname: &str, config: RemoteConfig) -> Result<(), String> {
        let config_path = DirectoryService::get_remote_config_path(nickname)?;

        // Create the config directory if it doesn't exist
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let config_str = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        fs::write(config_path, config_str).map_err(|e| e.to_string())
    }

    pub fn create_default_remote_config() -> RemoteConfig {
        RemoteConfig {
            remote_ip: "192.168.1.237".to_string(),
            remote_port: "22".to_string(),
            username: "sourccey".to_string(),
            password: "vulcan".to_string(),
            left_arm_port: "COM3".to_string(),
            right_arm_port: "COM8".to_string(),
            keyboard: "keyboard".to_string(),
            fps: 30,
        }
    }
}
