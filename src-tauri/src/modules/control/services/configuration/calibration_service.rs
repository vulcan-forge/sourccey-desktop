use crate::modules::control::controllers::configuration::calibration_controller::CalibrationConfig;
use crate::modules::control::types::configuration::calibration_types::{
    Calibration, MotorCalibration,
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

pub struct CalibrationService;

impl CalibrationService {

    //----------------------------------------------------------//
    // Calibration Functions
    //----------------------------------------------------------//
    pub fn read_calibration(nickname: &str) -> Result<Calibration, String> {
        let calibration_path = DirectoryService::get_robot_calibration_path(nickname)?;

        // Create the calibration directory if it doesn't exist
        if let Some(parent) = calibration_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // If calibration file doesn't exist, create it with default values
        if !calibration_path.exists() {
            let default_calibration = Self::create_default_calibration();
            Self::write_calibration(&nickname, default_calibration.clone())?;
            return Ok(default_calibration);
        }

        // Read and parse the existing calibration file
        let calibration_str = fs::read_to_string(calibration_path).map_err(|e| e.to_string())?;
        let calibration: Calibration = serde_json::from_str(&calibration_str)
            .map_err(|e| format!("Failed to parse calibration file: {}", e))?;

        Ok(calibration)
    }

    pub fn write_calibration(nickname: &str, calibration: Calibration) -> Result<(), String> {
        let calibration_path = DirectoryService::get_robot_calibration_path(nickname)?;

        // Create the calibration directory if it doesn't exist
        if let Some(parent) = calibration_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let calibration_str =
            serde_json::to_string_pretty(&calibration).map_err(|e| e.to_string())?;
        fs::write(calibration_path, calibration_str).map_err(|e| e.to_string())
    }

    pub fn create_default_calibration() -> Calibration {
        let mut motors = HashMap::new();

        // Add the default calibration values for SO100 follower
        motors.insert(
            "shoulder_pan".to_string(),
            MotorCalibration {
                id: 1,
                drive_mode: 0,
                homing_offset: 0,
                range_min: 1000,
                range_max: 3095,
            },
        );

        motors.insert(
            "shoulder_lift".to_string(),
            MotorCalibration {
                id: 2,
                drive_mode: 0,
                homing_offset: 0,
                range_min: 800,
                range_max: 3295,
            },
        );

        motors.insert(
            "elbow_flex".to_string(),
            MotorCalibration {
                id: 3,
                drive_mode: 0,
                homing_offset: 0,
                range_min: 850,
                range_max: 3245,
            },
        );

        motors.insert(
            "wrist_flex".to_string(),
            MotorCalibration {
                id: 4,
                drive_mode: 0,
                homing_offset: 0,
                range_min: 750,
                range_max: 3245,
            },
        );

        motors.insert(
            "wrist_roll".to_string(),
            MotorCalibration {
                id: 5,
                drive_mode: 0,
                homing_offset: 0,
                range_min: 0,
                range_max: 4095,
            },
        );

        motors.insert(
            "gripper".to_string(),
            MotorCalibration {
                id: 6,
                drive_mode: 0,
                homing_offset: 0,
                range_min: 2023,
                range_max: 3529,
            },
        );

        Calibration { motors }
    }

    pub async fn auto_calibrate(
        db_connection: DatabaseConnection,
        config: CalibrationConfig,
    ) -> Result<(), String> {
        Self::auto_calibrate_robot(
            db_connection.clone(),
            &config.robot_type,
            &config.nickname,
            &config.robot_port,
        )
        .await?;
        Self::auto_calibrate_teleoperator(
            db_connection.clone(),
            &config.teleop_type,
            &config.nickname,
            &config.teleop_port,
        )
        .await?;
        Ok(())
    }

    async fn auto_calibrate_robot(
        db_connection: DatabaseConnection,
        robot_type: &str,
        nickname: &str,
        port: &str,
    ) -> Result<(), String> {
        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;

        let mut command_parts = vec!["python".to_string()];
        command_parts.push("src/lerobot/scripts/sourccey/auto_calibrate.py".to_string());
        command_parts.push(format!("--robot.type={}", robot_type));
        command_parts.push(format!("--robot.id={}", nickname));
        command_parts.push(format!("--robot.port={}", port));

        let mut cmd = Command::new(python_path);
        for arg in &command_parts[1..] {
            cmd.arg(arg);
        }

        let child = cmd
            .current_dir(&lerobot_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to auto calibrate: {}", e))?;
        let pid = child.id();

        // Create command log service with the provided connection
        let command_string = command_parts.join(" ");
        let command_log_service = CommandLogService::new(db_connection.clone());
        let command_log = match command_log_service
            .add_robot_command_log(
                &command_string,
                Some(robot_type.to_string()),
                Some(nickname.to_string().clone()),
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

        if let Some(pid_value) = pid {
            ProcessService::on_process_shutdown(pid_value, db_connection, command_log_id);
        }
        Ok(())
    }

    async fn auto_calibrate_teleoperator(
        db_connection: DatabaseConnection,
        teleop_type: &str,
        nickname: &str,
        port: &str,
    ) -> Result<(), String> {
        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;

        let mut command_parts = vec!["python".to_string()];
        command_parts.push("src/lerobot/scripts/sourccey/auto_calibrate.py".to_string());
        command_parts.push(format!("--teleop.type={}", teleop_type));
        command_parts.push(format!("--teleop.id={}", nickname));
        command_parts.push(format!("--teleop.port={}", port));

        let mut cmd = Command::new(python_path);
        for arg in &command_parts[1..] {
            cmd.arg(arg);
        }

        let child = cmd
            .current_dir(&lerobot_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to auto calibrate: {}", e))?;
        let pid = child.id();

        // Create command log service with the provided connection
        let command_string = command_parts.join(" ");
        let command_log_service = CommandLogService::new(db_connection.clone());
        let command_log = match command_log_service
            .add_robot_command_log(
                &command_string,
                Some(teleop_type.to_string()),
                Some(nickname.to_string()),
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

        if let Some(pid_value) = pid {
            ProcessService::on_process_shutdown(pid_value, db_connection, command_log_id);
        }
        Ok(())
    }

    pub async fn remote_auto_calibrate(
        db_connection: DatabaseConnection,
        nickname: &str,
        robot_type: &str,
        full_reset: bool,
    ) -> Result<(), String> {
        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;

        let mut command_parts = vec!["python".to_string()];
        command_parts.push("src/lerobot/scripts/sourccey/auto_calibrate.py".to_string());
        command_parts.push(format!("--robot.type={}", robot_type));
        command_parts.push(format!("--robot.id={}", nickname));
        if full_reset {
            command_parts.push(format!("--full_reset=True"));
        }

        let mut cmd = Command::new(python_path);
        for arg in &command_parts[1..] {
            cmd.arg(arg);
        }

        let child = cmd
            .current_dir(&lerobot_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to auto calibrate: {}", e))?;
        let pid = child.id();

        // Create command log service with the provided connection
        let command_string = command_parts.join(" ");
        let command_log_service = CommandLogService::new(db_connection.clone());
        let command_log = match command_log_service
            .add_robot_command_log(
                &command_string,
                Some(robot_type.to_string()),
                Some(nickname.to_string().clone()),
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

        if let Some(pid_value) = pid {
            ProcessService::on_process_shutdown(pid_value, db_connection, command_log_id);
        }
        Ok(())
    }
}
