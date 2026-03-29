use crate::modules::control::controllers::configuration::calibration_controller::{
    CalibrationConfig, DesktopTeleopCalibrationConfig, DesktopTeleopCalibrationStatus,
};
use crate::modules::control::types::configuration::calibration_types::{
    Calibration, MotorCalibration,
};
use crate::modules::log::services::command_log_service::CommandLogService;
use crate::services::directory::directory_service::DirectoryService;
use crate::services::log::log_service::LogService;
use crate::services::process::process_service::ProcessService;
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::AppHandle;
use tokio::process::Command;

pub struct CalibrationService;

impl CalibrationService {

    //----------------------------------------------------------//
    // Calibration Functions
    //----------------------------------------------------------//
    pub fn read_calibration(robot_type: &str, nickname: &str) -> Result<(Calibration, bool), String> {
        let calibration_path = DirectoryService::get_robot_calibration_path(robot_type, &format!("{}.json", nickname))?;

        // Create the calibration directory if it doesn't exist
        if let Some(parent) = calibration_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // If calibration file doesn't exist, create it with default values
        if !calibration_path.exists() {
            let default_calibration = Self::create_default_calibration(robot_type, nickname);
            Self::write_calibration(robot_type, nickname, default_calibration.clone())?;
            return Ok((default_calibration, true));
        }

        // Read and parse the existing calibration file
        let calibration_str = fs::read_to_string(calibration_path).map_err(|e| e.to_string())?;
        let calibration: Calibration = serde_json::from_str(&calibration_str)
            .map_err(|e| format!("Failed to parse calibration file: {}", e))?;
        Ok((calibration, true))
    }

    pub fn write_calibration(robot_type: &str, nickname: &str, calibration: Calibration) -> Result<(), String> {
        let calibration_path = DirectoryService::get_robot_calibration_path(robot_type, &format!("{}.json", nickname))?;

        // Create the calibration directory if it doesn't exist
        if let Some(parent) = calibration_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let calibration_str =
            serde_json::to_string_pretty(&calibration).map_err(|e| e.to_string())?;
        fs::write(calibration_path, calibration_str).map_err(|e| e.to_string())
    }

    pub fn get_calibration_modified_at(robot_type: &str, nickname: &str) -> Result<Option<u64>, String> {
        let calibration_path = DirectoryService::get_robot_calibration_path(robot_type, &format!("{}.json", nickname))?;

        if !calibration_path.exists() {
            return Ok(None);
        }

        let metadata = fs::metadata(calibration_path).map_err(|e| e.to_string())?;
        let modified = metadata.modified().map_err(|e| e.to_string())?;
        let since_epoch = modified
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?;

        Ok(Some(since_epoch.as_millis() as u64))
    }

    fn normalize_nickname(nickname: &str) -> String {
        nickname.trim().trim_start_matches('@').to_string()
    }

    fn validate_path_segment(segment: &str, field_name: &str) -> Result<String, String> {
        let value = segment.trim();
        if value.is_empty() {
            return Err(format!("{} cannot be empty", field_name));
        }
        if value == "." || value == ".." {
            return Err(format!("Invalid {}: relative path segment is not allowed", field_name));
        }
        if value.contains('/') || value.contains('\\') || value.contains('\0') {
            return Err(format!(
                "Invalid {}: path separators and null bytes are not allowed",
                field_name
            ));
        }
        if cfg!(windows) && value.contains(':') {
            return Err(format!("Invalid {}: ':' is not allowed in path segments", field_name));
        }
        Ok(value.to_string())
    }

    fn get_teleop_calibration_path(teleop_type: &str, nickname: &str) -> Result<PathBuf, String> {
        let safe_teleop_type = Self::validate_path_segment(teleop_type, "teleop_type")?;
        let safe_nickname = Self::validate_path_segment(nickname, "nickname")?;
        let cache_dir = DirectoryService::get_lerobot_cache_dir()?;
        Ok(cache_dir
            .join("calibration")
            .join("teleoperators")
            .join(safe_teleop_type)
            .join(format!("{}.json", safe_nickname)))
    }

    pub fn desktop_get_teleop_calibration_status(
        teleop_type: &str,
        nickname: &str,
    ) -> Result<DesktopTeleopCalibrationStatus, String> {
        let normalized_nickname = Self::normalize_nickname(nickname);
        let calibration_path = Self::get_teleop_calibration_path(teleop_type, &normalized_nickname)?;

        let exists = calibration_path.exists();
        let modified_at = if exists {
            let metadata = fs::metadata(&calibration_path).map_err(|e| e.to_string())?;
            let modified = metadata.modified().map_err(|e| e.to_string())?;
            let since_epoch = modified
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?;
            Some(since_epoch.as_millis() as u64)
        } else {
            None
        };

        Ok(DesktopTeleopCalibrationStatus {
            is_calibrated: exists,
            left_calibrated: exists,
            right_calibrated: exists,
            modified_at,
            calibration_path: Some(calibration_path.to_string_lossy().to_string()),
        })
    }

    fn decode_output_text(output: &std::process::Output) -> (String, String) {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        (stdout, stderr)
    }

    fn no_op_auto_calibration_reason(stdout: &str, stderr: &str) -> Option<String> {
        let combined = format!("{stdout}\n{stderr}").to_lowercase();
        if combined.contains("does not support auto-calibration") {
            return Some(
                "Calibration script reported that this device does not support auto-calibration."
                    .to_string(),
            );
        }
        None
    }

    fn validate_calibration_command_output(output: &std::process::Output) -> Result<(), String> {
        let (stdout, stderr) = Self::decode_output_text(output);
        if !output.status.success() {
            let details = if !stderr.is_empty() {
                stderr
            } else if !stdout.is_empty() {
                stdout
            } else {
                format!("exit status {}", output.status)
            };
            return Err(format!("Python script failed: {}", details));
        }

        if let Some(no_op_reason) = Self::no_op_auto_calibration_reason(&stdout, &stderr) {
            return Err(no_op_reason);
        }

        Ok(())
    }

    fn write_process_output_logs(app_handle: &AppHandle, context: &str, output: &std::process::Output) {
        let (stdout, stderr) = Self::decode_output_text(output);
        if !stdout.is_empty() {
            let _ = LogService::write_app_log_line(
                app_handle,
                "robot-actions.log",
                Some("calibration"),
                &format!("{} stdout: {}", context, stdout),
            );
        }
        if !stderr.is_empty() {
            let _ = LogService::write_app_log_line(
                app_handle,
                "robot-actions.log",
                Some("calibration"),
                &format!("{} stderr: {}", context, stderr),
            );
        }
    }

    pub async fn auto_calibrate(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        config: CalibrationConfig,
    ) -> Result<(), String> {
        let start_message = format!(
            "Auto calibrate started: nickname={}, robot_type={}, teleop_type={}, robot_port={}, teleop_port={}",
            config.nickname, config.robot_type, config.teleop_type, config.robot_port, config.teleop_port
        );
        let _ = LogService::write_app_log_line(&app_handle, "robot-actions.log", Some("calibration"), &start_message);

        Self::auto_calibrate_robot(
            &app_handle,
            db_connection.clone(),
            &config.robot_type,
            &config.nickname,
            &config.robot_port,
        )
        .await
        .map_err(|e| {
            let _ = LogService::write_app_log_line(
                &app_handle,
                "robot-actions.log",
                Some("calibration"),
                &format!("Auto calibrate robot failed: {}", e),
            );
            e
        })?;
        Self::auto_calibrate_teleoperator(
            &app_handle,
            db_connection.clone(),
            &config.teleop_type,
            &config.nickname,
            &config.teleop_port,
        )
        .await
        .map_err(|e| {
            let _ = LogService::write_app_log_line(
                &app_handle,
                "robot-actions.log",
                Some("calibration"),
                &format!("Auto calibrate teleoperator failed: {}", e),
            );
            e
        })?;
        let _ = LogService::write_app_log_line(
            &app_handle,
            "robot-actions.log",
            Some("calibration"),
            "Auto calibrate completed successfully",
        );
        Ok(())
    }

    pub async fn desktop_auto_calibrate_teleoperator(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        config: DesktopTeleopCalibrationConfig,
    ) -> Result<(), String> {
        let normalized_nickname = Self::normalize_nickname(&config.nickname);
        let teleop_type = config.teleop_type.trim().to_string();
        let left_arm_port = config.left_arm_port.trim().to_string();
        let right_arm_port = config.right_arm_port.trim().to_string();

        if teleop_type.is_empty() {
            return Err("teleop_type cannot be empty".to_string());
        }
        if left_arm_port.is_empty() {
            return Err("left_arm_port cannot be empty".to_string());
        }
        if right_arm_port.is_empty() {
            return Err("right_arm_port cannot be empty".to_string());
        }
        if normalized_nickname.is_empty() {
            return Err("nickname cannot be empty".to_string());
        }

        let start_message = format!(
            "Desktop teleoperator auto calibrate started: nickname={}, teleop_type={}, left_arm_port={}, right_arm_port={}, full_reset={}",
            normalized_nickname, teleop_type, left_arm_port, right_arm_port, config.full_reset
        );
        let _ = LogService::write_app_log_line(&app_handle, "robot-actions.log", Some("calibration"), &start_message);

        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;

        let mut command_parts = vec!["python".to_string()];
        command_parts.push("src/lerobot/scripts/sourccey/calibration/auto_calibrate.py".to_string());
        command_parts.push(format!("--teleop.type={}", teleop_type));
        command_parts.push(format!("--teleop.id={}", normalized_nickname));
        command_parts.push(format!("--teleop.left_arm_port={}", left_arm_port));
        command_parts.push(format!("--teleop.right_arm_port={}", right_arm_port));
        if config.full_reset {
            command_parts.push("--full_reset=True".to_string());
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
            .map_err(|e| format!("Failed to auto calibrate teleoperator: {}", e))?;
        let pid = child.id();

        let command_string = command_parts.join(" ");
        let command_log_service = CommandLogService::new(db_connection.clone());
        let command_log = match command_log_service
            .add_robot_command_log(
                &command_string,
                Some(teleop_type.clone()),
                Some(normalized_nickname.clone()),
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
        Self::write_process_output_logs(&app_handle, "Desktop teleoperator auto calibrate", &output);

        if let Err(validation_error) = Self::validate_calibration_command_output(&output) {
            if let Some(pid_value) = pid {
                ProcessService::on_process_shutdown(&app_handle, pid_value, db_connection, command_log_id);
            }
            let _ = LogService::write_app_log_line(
                &app_handle,
                "robot-actions.log",
                Some("calibration"),
                &format!("Desktop teleoperator auto calibrate failed: {}", validation_error),
            );
            return Err(validation_error);
        }

        if let Some(pid_value) = pid {
            ProcessService::on_process_shutdown(&app_handle, pid_value, db_connection, command_log_id);
        }

        let _ = LogService::write_app_log_line(
            &app_handle,
            "robot-actions.log",
            Some("calibration"),
            "Desktop teleoperator auto calibrate completed successfully",
        );
        Ok(())
    }

    async fn auto_calibrate_robot(
        app_handle: &AppHandle,
        db_connection: DatabaseConnection,
        robot_type: &str,
        nickname: &str,
        port: &str,
    ) -> Result<(), String> {
        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;

        let mut command_parts = vec!["python".to_string()];
        command_parts.push("src/lerobot/scripts/sourccey/calibration/auto_calibrate.py".to_string());
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
        Self::write_process_output_logs(app_handle, "Auto calibrate robot", &output);

        if let Err(validation_error) = Self::validate_calibration_command_output(&output) {
            if let Some(pid_value) = pid {
                ProcessService::on_process_shutdown(app_handle, pid_value, db_connection, command_log_id);
            }
            let _ = LogService::write_app_log_line(
                app_handle,
                "robot-actions.log",
                Some("calibration"),
                &format!("Auto calibrate robot failed: {}", validation_error),
            );
            return Err(validation_error);
        }

        if let Some(pid_value) = pid {
            ProcessService::on_process_shutdown(app_handle, pid_value, db_connection, command_log_id);
        }
        Ok(())
    }

    async fn auto_calibrate_teleoperator(
        app_handle: &AppHandle,
        db_connection: DatabaseConnection,
        teleop_type: &str,
        nickname: &str,
        port: &str,
    ) -> Result<(), String> {
        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;

        let mut command_parts = vec!["python".to_string()];
        command_parts.push("src/lerobot/scripts/sourccey/calibration/auto_calibrate.py".to_string());
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
        Self::write_process_output_logs(app_handle, "Auto calibrate teleoperator", &output);

        if let Err(validation_error) = Self::validate_calibration_command_output(&output) {
            if let Some(pid_value) = pid {
                ProcessService::on_process_shutdown(app_handle, pid_value, db_connection, command_log_id);
            }
            let _ = LogService::write_app_log_line(
                app_handle,
                "robot-actions.log",
                Some("calibration"),
                &format!("Auto calibrate teleoperator failed: {}", validation_error),
            );
            return Err(validation_error);
        }

        if let Some(pid_value) = pid {
            ProcessService::on_process_shutdown(app_handle, pid_value, db_connection, command_log_id);
        }
        Ok(())
    }

    pub async fn remote_auto_calibrate(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        nickname: &str,
        robot_type: &str,
        full_reset: bool,
    ) -> Result<(), String> {
        let start_message = format!(
            "Remote auto calibrate started: nickname={}, robot_type={}, full_reset={}",
            nickname, robot_type, full_reset
        );
        let _ = LogService::write_app_log_line(&app_handle, "robot-actions.log", Some("calibration"), &start_message);

        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;

        let mut command_parts = vec!["python".to_string()];
        command_parts.push("src/lerobot/scripts/sourccey/calibration/auto_calibrate.py".to_string());
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
        Self::write_process_output_logs(&app_handle, "Remote auto calibrate", &output);

        if let Err(validation_error) = Self::validate_calibration_command_output(&output) {
            if let Some(pid_value) = pid {
                ProcessService::on_process_shutdown(&app_handle, pid_value, db_connection, command_log_id);
            }
            let _ = LogService::write_app_log_line(
                &app_handle,
                "robot-actions.log",
                Some("calibration"),
                &format!("Remote auto calibrate failed: {}", validation_error),
            );
            return Err(validation_error);
        }

        if let Some(pid_value) = pid {
            ProcessService::on_process_shutdown(&app_handle, pid_value, db_connection, command_log_id);
        }
        let _ = LogService::write_app_log_line(
            &app_handle,
            "robot-actions.log",
            Some("calibration"),
            "Remote auto calibrate completed successfully",
        );
        Ok(())
    }

    //------------------------------------------------------------//
    // Default Calibration Functions
    //------------------------------------------------------------//
    pub fn create_default_calibration(robot_type: &str, nickname: &str) -> Calibration {
        if robot_type == "so100_follower" {
            return Self::create_default_so100_calibration();
        }
        else if robot_type == "sourccey_follower" {
            let arm_side = match nickname {
                "sourccey_left" => "left",
                "sourccey_right" => "right",
                _ => return Calibration { motors: HashMap::new() },
            };
            return Self::create_default_sourccey_calibration(&arm_side);
        }
        return Calibration { motors: HashMap::new() };
    }


    pub fn create_default_so100_calibration() -> Calibration {
        // First try to load the default calibration from the lerobot-vulcan repo
        if let Ok(lerobot_dir) = DirectoryService::get_lerobot_vulcan_dir() {
            let default_path = lerobot_dir
                .join("src")
                .join("lerobot")
                .join("robots")
                .join("so100_follower")
                .join("default_calibration.json");

            if let Ok(default_str) = fs::read_to_string(&default_path) {
                match serde_json::from_str::<Calibration>(&default_str) {
                    Ok(calibration) => {
                        return calibration;
                    }
                    Err(e) => {
                        eprintln!(
                            "Failed to parse default calibration file at {:?}: {}. Falling back to built-in defaults.",
                            default_path, e
                        );
                    }
                }
            } else {
                eprintln!(
                    "Default calibration file not found or unreadable at {:?}. Falling back to built-in defaults.",
                    default_path
                );
            }
        } else {
            eprintln!(
                "Could not resolve lerobot-vulcan directory. Falling back to built-in defaults."
            );
        }

        let motors = HashMap::new();
        Calibration { motors }
    }

    pub fn create_default_sourccey_calibration(arm_side: &str) -> Calibration {
        // First try to load the default calibration from the lerobot-vulcan repo
        if let Ok(lerobot_dir) = DirectoryService::get_lerobot_vulcan_dir() {
            let default_path = lerobot_dir
                .join("src")
                .join("lerobot")
                .join("robots")
                .join("sourccey")
                .join("sourccey")
                .join("sourccey")
                .join(format!("{}_arm_default_calibration.json", arm_side));

            if let Ok(default_str) = fs::read_to_string(&default_path) {
                match serde_json::from_str::<Calibration>(&default_str) {
                    Ok(calibration) => {
                        return calibration;
                    }
                    Err(e) => {
                        eprintln!(
                            "Failed to parse default calibration file at {:?}: {}. Falling back to built-in defaults.",
                            default_path, e
                        );
                    }
                }
            } else {
                eprintln!(
                    "Default calibration file not found or unreadable at {:?}. Falling back to built-in defaults.",
                    default_path
                );
            }
        } else {
            eprintln!(
                "Could not resolve lerobot-vulcan directory. Falling back to built-in defaults."
            );
        }

        let motors = HashMap::new();
        Calibration { motors }
    }
}

#[cfg(test)]
#[path = "tests/calibration_service_tests.rs"]
mod calibration_service_tests;
