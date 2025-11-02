use crate::modules::ai::controllers::training::training_controller::TrainingConfig;
use crate::modules::log::services::command_log_service::CommandLogService;
use crate::services::directory::directory_service::DirectoryService;
use crate::services::environment::env_service::EnvService;
use crate::services::log::log_service::LogService;
use crate::services::process::process_service::ProcessService;
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::io::BufRead;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Emitter;

// Create a struct to hold our process and shutdown flag
pub struct TrainingProcess(Arc<Mutex<HashMap<String, (Child, Arc<AtomicBool>, String)>>>);

pub struct TrainingService;

impl TrainingService {
    /// Initialize the training state
    pub fn init_training() -> TrainingProcess {
        TrainingProcess(Arc::new(Mutex::new(HashMap::new())))
    }

    /// Start the training Python script
    pub async fn start_training(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        state: &TrainingProcess,
        config: TrainingConfig,
    ) -> Result<String, String> {
        // Check if a process with this model_name is already running
        {
            let processes = state.0.lock().unwrap();
            if processes.contains_key(&config.model_name) {
                return Err(format!(
                    "Training process for job name '{}' is already running",
                    config.model_name
                ));
            }
        }

        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;
        let lerobot_cache_dir = DirectoryService::get_lerobot_cache_dir()?;

        let mut command_parts = vec!["python".to_string()];
        command_parts.push("src/lerobot/scripts/train.py".to_string());
        command_parts.push(format!(
            "--dataset.repo_id=\"{}/{}\"",
            config.repo_dir, config.dataset
        ));
        command_parts.push(format!("--policy.type={}", config.policy_type));
        let model_path = format!(
            "{}/ai_models/{}/{}",
            lerobot_cache_dir.display().to_string().replace('\\', "/"),
            config.repo_dir,
            config.model_name
        );
        command_parts.push(format!("--output_dir=\"{}\"", model_path));
        command_parts.push(format!("--job_name=\"{}\"", config.model_name));
        command_parts.push("--policy.device=cuda".to_string());
        command_parts.push(format!("--batch_size={}", config.batch_size));
        command_parts.push(format!("--steps={}", config.steps));
        command_parts.push("--wandb.enable=false".to_string());
        command_parts.push("--policy.push_to_hub=false".to_string());

        let mut cmd = Command::new(python_path);
        for arg in &command_parts[1..] {
            cmd.arg(arg);
        }

        EnvService::add_python_env_vars(&mut cmd)?;
        EnvService::add_hide_warnings_env_vars(&mut cmd)?;

        let mut child = cmd
            .current_dir(&lerobot_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start training: {}", e))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let shutdown_flag = Arc::new(AtomicBool::new(false));

        // Create command log service with the provided connection
        let command_string = command_parts.join(" ");
        let command_log_service = CommandLogService::new(db_connection.clone());
        let command_log = match command_log_service
            .add_robot_command_log(&command_string, None, None)
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

        let log_key = format!("training-log-{}", config.model_name).to_string();
        LogService::start_logger(
            stdout,
            &app_handle,
            &shutdown_flag,
            Some(&config.repo_dir),
            Some(&log_key),
            None,
            true,
            false,
        );

        LogService::start_logger(
            stderr,
            &app_handle,
            &shutdown_flag,
            Some(&config.repo_dir),
            Some(&log_key),
            None,
            true,
            true,
        );

        // Store the process
        state.0.lock().unwrap().insert(
            config.model_name.clone(),
            (child, shutdown_flag.clone(), command_log_id.clone()),
        );

        // Start process monitoring with built-in delay
        let process_shutdown_key =
            format!("training-process-shutdown-{}", config.model_name).to_string();
        ProcessService::start_process_monitor_with_defaults(
            pid,
            app_handle.clone(),
            state.0.clone(),
            shutdown_flag.clone(),
            config.model_name.clone(),
            process_shutdown_key,
            serde_json::json!({
                "repo_dir": config.repo_dir.clone(),
                "model_name": config.model_name.clone(),
                "exit_code": None::<i32>,
                "message": "Training process died unexpectedly"
            }),
            Some(command_log_id),
            Some(db_connection),
        );

        Ok("Local Training script started successfully".to_string())
    }

    /// Stop the training Python script
    pub fn stop_training(
        db_connection: DatabaseConnection,
        state: &TrainingProcess,
        model_name: String,
    ) -> Result<String, String> {
        if let Some((child, shutdown_flag, command_log_id)) =
            state.0.lock().unwrap().remove(&model_name)
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

            Ok("Training script stop command sent".to_string())
        } else {
            Ok("No training process was running".to_string())
        }
    }

    /// Check if a model exists
    pub fn training_exists(training_config: TrainingConfig) -> Result<bool, String> {
        let model_path = DirectoryService::get_lerobot_ai_model_path(
            &training_config.repo_dir,
            &training_config.model_name,
        )?;
        if !model_path.exists() {
            return Ok(false);
        }
        Ok(true)
    }
}
