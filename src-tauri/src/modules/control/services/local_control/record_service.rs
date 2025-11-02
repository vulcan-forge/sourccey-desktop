use crate::modules::control::controllers::local_control::record_controller::RecordConfig;
use crate::modules::log::services::command_log_service::CommandLogService;
use crate::services::directory::directory_service::DirectoryService;
use crate::services::environment::env_service::EnvService;
use crate::services::log::log_service::LogService;
use crate::services::process::process_service::ProcessService;
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Emitter;

// Create a struct to hold our process, stdin, and shutdown flag
pub struct RecordProcess(
    Arc<Mutex<HashMap<String, (Child, std::process::ChildStdin, Arc<AtomicBool>, String)>>>,
);

pub struct RecordService;

impl RecordService {
    pub fn init_record() -> RecordProcess {
        RecordProcess(Arc::new(Mutex::new(HashMap::new())))
    }

    pub async fn start_record(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        state: &RecordProcess,
        config: RecordConfig,
    ) -> Result<String, String> {
        // Check if a process with this nickname is already running
        {
            let processes = state.0.lock().unwrap();
            if processes.contains_key(&config.nickname) {
                return Err(format!(
                    "Record process for nickname '{}' is already running",
                    config.nickname
                ));
            }
        }

        // Create the full path to the lerobot-vulcan directory
        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;
        let robot_type = "so100_follower".to_string();
        let teleop_type = "so100_leader".to_string();

        let command_parts = build_command_parts(&config, &robot_type, &teleop_type);
        let command_parts_for_log = build_command_parts_for_log(&config, &robot_type, &teleop_type);

        // Now build the actual Command
        let mut cmd = Command::new(python_path);
        for arg in &command_parts[1..] {
            cmd.arg(arg);
        }

        // Add all required environment variables
        EnvService::add_python_env_vars(&mut cmd)?;

        let mut child = cmd
            .current_dir(&lerobot_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start record: {}", e))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let stdin = child.stdin.take();
        let shutdown_flag = Arc::new(AtomicBool::new(false));

        // Create command log service with the provided connection
        let command_string = command_parts_for_log.join(" ");
        let command_log_service = CommandLogService::new(db_connection.clone());
        let command_log = match command_log_service
            .add_robot_command_log(
                &command_string,
                Some(robot_type),
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

        // Get the process ID BEFORE storing the child
        let pid = child.id();
        let command_log_id = command_log.id.clone();

        // Start logging for stdout and stderr
        LogService::start_logger(
            stdout,
            &app_handle,
            &shutdown_flag,
            Some(&config.nickname),
            Some("record-log"),
            None,
            true,
            false,
        );

        LogService::start_logger(
            stderr,
            &app_handle,
            &shutdown_flag,
            Some(&config.nickname),
            Some("record-log"),
            None,
            true,
            true,
        );

        // Store the process with stdin using the nickname as key
        if let Some(stdin) = stdin {
            state.0.lock().unwrap().insert(
                config.nickname.clone(),
                (child, stdin, shutdown_flag.clone(), command_log_id.clone()),
            );
        } else {
            return Err("Failed to capture stdin from record process".to_string());
        }

        // Start process monitoring with built-in delay
        ProcessService::start_process_monitor_with_defaults(
            pid,
            app_handle.clone(),
            state.0.clone(),
            shutdown_flag.clone(),
            config.nickname.clone(),
            "record-process-shutdown".to_string(),
            serde_json::json!({
                "nickname": config.nickname.clone(),
                "exit_code": None::<i32>,
                "message": "Record process died unexpectedly"
            }),
            Some(command_log_id),
            Some(db_connection),
        );

        Ok(format!(
            "Local Record script started successfully for nickname: {}",
            config.nickname
        ))
    }

    pub fn stop_record(
        db_connection: DatabaseConnection,
        state: &RecordProcess,
        nickname: String,
    ) -> Result<String, String> {
        if let Some((child, _stdin, shutdown_flag, command_log_id)) =
            state.0.lock().unwrap().remove(&nickname)
        {
            // Signal threads to stop
            shutdown_flag.store(true, Ordering::Relaxed);

            // Update command log on shutdown
            ProcessService::on_process_shutdown(child.id(), db_connection, command_log_id);

            // Kill the process
            #[cfg(windows)]
            {
                let pid = child.id();
                let _ = Command::new("taskkill")
                    .args(&["/F", "/T", "/PID", &pid.to_string()])
                    .output();
            }

            Ok("Record script stop command sent".to_string())
        } else {
            Ok("No record process was running".to_string())
        }
    }

    pub fn save_record_episode(state: &RecordProcess, nickname: String) -> Result<String, String> {
        if let Some((_child, stdin, _shutdown_flag, _command_log_id)) =
            state.0.lock().unwrap().get_mut(&nickname)
        {
            // Send right arrow key event to trigger episode save
            // The Python script should be listening for this input
            let command = "RIGHT_ARROW\n";
            stdin
                .write_all(command.as_bytes())
                .map_err(|e| format!("Failed to send save command: {}", e))?;

            Ok("Save episode command sent (right arrow)".to_string())
        } else {
            Err("No record process is running".to_string())
        }
    }

    pub fn reset_record_episode(state: &RecordProcess, nickname: String) -> Result<String, String> {
        if let Some((_child, stdin, _shutdown_flag, _command_log_id)) =
            state.0.lock().unwrap().get_mut(&nickname)
        {
            // Send left arrow key event to trigger episode reset
            let command = "LEFT_ARROW\n";
            stdin
                .write_all(command.as_bytes())
                .map_err(|e| format!("Failed to send reset command: {}", e))?;

            Ok("Reset episode command sent (left arrow)".to_string())
        } else {
            Err("No record process is running".to_string())
        }
    }
}

fn build_command_parts(config: &RecordConfig, robot_type: &str, teleop_type: &str) -> Vec<String> {
    let mut parts = vec!["python".to_string(), "src/lerobot/scripts/lerobot_record.py".to_string()];

    parts.push(format!("--robot.type={}", robot_type));
    parts.push(format!("--robot.port=\"{}\"", config.robot_port));
    parts.push(format!("--robot.id=\"{}\"", config.nickname));
    parts.push(format!("--teleop.type={}", teleop_type));
    parts.push(format!("--teleop.port=\"{}\"", config.teleop_port));
    parts.push(format!("--teleop.id=\"{}\"", config.nickname));
    parts.push(format!(
        "--dataset.repo_id=\"{}/{}\"",
        config.nickname, config.dataset.dataset
    ));
    parts.push(format!(
        "--dataset.num_episodes={}",
        config.dataset.num_episodes
    ));
    parts.push(format!(
        "--dataset.episode_time_s={}",
        config.dataset.episode_time_s
    ));
    parts.push(format!(
        "--dataset.reset_time_s={}",
        config.dataset.reset_time_s
    ));
    parts.push(format!("--dataset.single_task=\"{}\"", config.dataset.task));
    parts.push("--dataset.push_to_hub=false".to_string());

    if let Some(camera_config) = &config.camera_config {
        let camera_config_str = format!(
            "{{\"{}\": {{\"type\": \"{}\", \"index_or_path\": {}, \"width\": {}, \"height\": {}, \"fps\": {}}}}}",
            camera_config.camera_name,
            camera_config.camera_type,
            camera_config.camera_index,
            camera_config.width,
            camera_config.height,
            camera_config.fps
        );
        parts.push(format!("--robot.cameras={}", camera_config_str));
    }

    parts
}

fn build_command_parts_for_log(
    config: &RecordConfig,
    robot_type: &str,
    teleop_type: &str,
) -> Vec<String> {
    let mut parts = vec!["python".to_string(), "src/lerobot/scripts/lerobot_record.py".to_string()];

    parts.push(format!("--robot.type={}", robot_type));
    parts.push(format!("--robot.port=\"{}\"", config.robot_port));
    parts.push(format!("--robot.id=\"{}\"", config.nickname));
    parts.push(format!("--teleop.type={}", teleop_type));
    parts.push(format!("--teleop.port=\"{}\"", config.teleop_port));
    parts.push(format!("--teleop.id=\"{}\"", config.nickname));
    parts.push(format!(
        "--dataset.repo_id=\"{}/{}\"",
        config.nickname, config.dataset.dataset
    ));
    parts.push(format!(
        "--dataset.num_episodes={}",
        config.dataset.num_episodes
    ));
    parts.push(format!(
        "--dataset.episode_time_s={}",
        config.dataset.episode_time_s
    ));
    parts.push(format!(
        "--dataset.reset_time_s={}",
        config.dataset.reset_time_s
    ));
    parts.push(format!("--dataset.single_task=\"{}\"", config.dataset.task));
    parts.push("--dataset.push_to_hub=false".to_string());

    if let Some(camera_config) = &config.camera_config {
        let camera_config_str = format!(
            "{{ '{}': {{ 'type': '{}', 'index_or_path': {}, 'width': {}, 'height': {}, 'fps': {}}}}}",
            camera_config.camera_name,
            camera_config.camera_type,
            camera_config.camera_index,
            camera_config.width,
            camera_config.height,
            camera_config.fps
        );
        parts.push(format!("--robot.cameras=\"{}\"", camera_config_str)); // Quoted for logging
    }

    parts
}
