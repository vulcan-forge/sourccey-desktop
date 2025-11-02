use crate::modules::ai::services::dataset::v3::dataset_parquet_service::DatasetParquetService;
use crate::modules::ai::services::dataset::v3::dataset_video_service::DatasetVideoService;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::EpisodeMetadata;
use crate::modules::ai::types::dataset::v3::dataset_parquet_types::{
    ColumnData, DatasetParquet, EpisodeParquet,
};
use crate::modules::ai::types::dataset::v3::dataset_types::{Dataset, TaskOverview};
use crate::modules::ai::types::dataset::v3::dataset_video_types::{VideoData, VideoEpisode};
use crate::services::environment::env_service::EnvService;
use crate::services::directory::directory_service::DirectoryService;
use sea_orm::DatabaseConnection;
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use chrono;
use serde::{Deserialize, Serialize};
use serde_json;
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use crate::modules::ai::controllers::dataset::v3::dataset_controller::DatasetPath;
use crate::modules::log::services::command_log_service::CommandLogService;
use crate::modules::log::models::command_log::{ActiveModel as CommandLogActiveModel, CommandLog};
use crate::services::log::log_service::LogService;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::AppHandle;

pub struct DatasetService;

impl DatasetService {
    //----------------------------------------------------------------------------
    // Get Dataset Functions
    //----------------------------------------------------------------------------

    /// Get all training datasets across all user names with optional pagination
    pub fn get_all_datasets(
        pagination: Option<PaginationParameters>,
    ) -> Result<PaginatedResponse<Dataset>, String> {
        let cache_path = DirectoryService::get_lerobot_cache_dir()?;
        if !cache_path.exists() {
            return Ok(Self::create_empty_paginated_response(pagination));
        }

        if !cache_path.is_dir() {
            return Err(format!(
                "Cache path exists but is not a directory: {:?}",
                cache_path
            ));
        }

        // Get pagination parameters
        let page = pagination.as_ref().and_then(|p| p.page).unwrap_or(1);
        let page_size = pagination.as_ref().and_then(|p| p.page_size).unwrap_or(20);

        // Validate pagination parameters
        if page < 1 {
            return Err("Page must be greater than 0".to_string());
        }
        if page_size < 1 {
            return Err("Page size must be greater than 0".to_string());
        }

        // First, count total datasets across all names to get total count
        let total = Self::count_all_datasets(&cache_path)?;
        if total == 0 {
            return Ok(Self::create_empty_paginated_response(pagination));
        }

        let total_pages = (total + page_size - 1) / page_size; // Ceiling division

        // Calculate slice bounds
        let start = (page - 1) * page_size;
        let end = std::cmp::min(start + page_size, total);

        // Ensure start doesn't exceed total
        if start >= total {
            return Ok(Self::create_empty_paginated_response(pagination));
        }

        // Now read only the datasets we need for this page
        let data = Self::read_all_datasets_page(&cache_path, start, end)?;
        Ok(PaginatedResponse {
            data,
            total,
            page,
            page_size,
            total_pages,
            has_next: page < total_pages,
            has_previous: page > 1,
        })
    }

    /// Get training dataset directories for a specific name with optional pagination
    pub fn get_datasets(
        nickname: &str,
        pagination: Option<PaginationParameters>,
    ) -> Result<PaginatedResponse<Dataset>, String> {
        let repo_path = DirectoryService::get_lerobot_repository_path(nickname)?;
        if !repo_path.exists() {
            return Ok(Self::create_empty_paginated_response(pagination));
        }

        if !repo_path.is_dir() {
            return Err(format!(
                "Path exists but is not a directory: {:?}",
                repo_path
            ));
        }

        // Get pagination parameters
        let page = pagination.as_ref().and_then(|p| p.page).unwrap_or(1);
        let page_size = pagination.as_ref().and_then(|p| p.page_size).unwrap_or(20);

        // Validate pagination parameters
        if page < 1 {
            return Err("Page must be greater than 0".to_string());
        }
        if page_size < 1 {
            return Err("Page size must be greater than 0".to_string());
        }

        // First, count total directories to get total count
        let total = Self::count_datasets(&repo_path)?;
        if total == 0 {
            return Ok(Self::create_empty_paginated_response(pagination));
        }

        let total_pages = (total + page_size - 1) / page_size; // Ceiling division

        // Calculate slice bounds
        let start = (page - 1) * page_size;
        let end = std::cmp::min(start + page_size, total);

        // Ensure start doesn't exceed total
        if start >= total {
            return Ok(Self::create_empty_paginated_response(pagination));
        }

        // Now read only the directories we need for this page
        let data = Self::read_dataset_page(&repo_path, start, end)?;

        Ok(PaginatedResponse {
            data,
            total,
            page,
            page_size,
            total_pages,
            has_next: page < total_pages,
            has_previous: page > 1,
        })
    }

    /// Get a specific dataset by its full name (nickname)
    pub fn get_dataset(nickname: &str, dataset: &str) -> Result<Option<Dataset>, String> {
        let dataset_path = DirectoryService::get_lerobot_dataset_path(nickname, dataset)?;
        if !dataset_path.exists() {
            return Ok(None);
        }

        if !dataset_path.is_dir() {
            return Err(format!(
                "Path exists but is not a directory: {:?}",
                dataset_path
            ));
        }

        // Create the dataset info
        let repo_id = format!("{}/{}", nickname, dataset);
        let episodes = Self::count_episodes(&dataset_path)?;
        let tasks = Self::get_task_overview(&dataset_path)?;
        let size = Self::get_size(&dataset_path)?;
        let robot_type = Self::load_robot_type(&dataset_path)?;
        let updated_at = Self::get_date_modified(&dataset_path)?;

        let dataset = Dataset {
            repo_id: repo_id.to_string(),
            nickname: nickname.to_string(),
            dataset: dataset.to_string(),
            path: dataset_path.to_string_lossy().to_string(),
            episodes,
            tasks,
            size,
            robot_type,
            updated_at: updated_at.to_string(),
        };

        Ok(Some(dataset))
    }

    //----------------------------------------------------------------------------
    // Count Dataset Functions
    //----------------------------------------------------------------------------

    /// Count the total number of dataset directories across all user names without loading them
    pub fn count_all_datasets(cache_path: &PathBuf) -> Result<usize, String> {
        let entries = fs::read_dir(cache_path)
            .map_err(|e| format!("Failed to read cache directory {:?}: {}", cache_path, e))?;

        let mut total_count = 0;
        let excluded_folders = ["ai_models", "config", "calibration"];

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_dir() {
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown");

                // Skip excluded folders
                if excluded_folders.contains(&name) {
                    continue;
                }

                // Look inside this folder for dataset directories
                let name_count = Self::count_datasets(&path)?;
                total_count += name_count;
            }
        }

        Ok(total_count)
    }

    /// Count the total number of dataset directories without loading them all
    pub fn count_datasets(dataset_path: &PathBuf) -> Result<usize, String> {
        let entries = fs::read_dir(dataset_path)
            .map_err(|e| format!("Failed to read directory {:?}: {}", dataset_path, e))?;

        let count = entries
            .filter_map(|entry| {
                entry
                    .ok()
                    .and_then(|e| if e.path().is_dir() { Some(()) } else { None })
            })
            .count();

        Ok(count)
    }

    pub fn count_episodes(dataset_path: &PathBuf) -> Result<usize, String> {
        let info_path = dataset_path.join("meta").join("info.json");
        if !info_path.exists() {
            return Ok(0);
        }

        let info_content = fs::read_to_string(&info_path)
            .map_err(|e| format!("Failed to read info.json at {:?}: {}", info_path, e))?;

        let info: serde_json::Value = serde_json::from_str(&info_content)
            .map_err(|e| format!("Failed to parse info.json at {:?}: {}", info_path, e))?;

        let total_episodes = info["total_episodes"].as_u64().ok_or_else(|| {
            format!(
                "total_episodes field not found or not a number in {:?}",
                info_path
            )
        })?;

        Ok(total_episodes as usize)
    }

    //----------------------------------------------------------------------------
    // Dataset Pagination Functions
    //----------------------------------------------------------------------------

    /// Read only the datasets for a specific page range across all user names
    fn read_all_datasets_page(
        cache_path: &PathBuf,
        target_start: usize,
        target_end: usize,
    ) -> Result<Vec<Dataset>, String> {
        let entries = fs::read_dir(cache_path)
            .map_err(|e| format!("Failed to read cache directory {:?}: {}", cache_path, e))?;

        let mut datasets = Vec::new();
        let mut current_index = 0;
        let excluded_folders = ["ai_models", "config", "calibration"];

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_dir() {
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown");

                // Skip excluded folders
                if excluded_folders.contains(&name) {
                    continue;
                }

                // Count datasets for this name to know the range
                let count = Self::count_datasets(&path)?;
                let start = current_index;
                let end = current_index + count;

                // Check if this name's datasets overlap with our target range
                if end > target_start && start < target_end {
                    // Calculate the overlap
                    let overlap_start = std::cmp::max(target_start, start);
                    let overlap_end = std::cmp::min(target_end, end);

                    // Calculate the relative start/end within this name's datasets
                    let relative_start = overlap_start - start;
                    let relative_end = overlap_end - start;

                    // Read the overlapping datasets for this name
                    let dataset = Self::read_dataset_page(&path, relative_start, relative_end)?;
                    datasets.extend(dataset);
                }

                current_index += count;

                // Early exit if we've processed all we need
                if current_index >= target_end {
                    break;
                }
            }
        }

        Ok(datasets)
    }

    /// Read only the datasets for a specific page range
    fn read_dataset_page(
        dataset_path: &PathBuf,
        start: usize,
        end: usize,
    ) -> Result<Vec<Dataset>, String> {
        let entries = fs::read_dir(dataset_path)
            .map_err(|e| format!("Failed to read directory {:?}: {}", dataset_path, e))?;

        let mut datasets = Vec::new();
        let mut current_index = 0;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();
            if path.is_dir() {
                // Only process directories in our target range
                if current_index >= start && current_index < end {
                    let nickname = path
                        .parent()
                        .and_then(|p| p.file_name())
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string();
                    let dataset = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let episodes = Self::count_episodes(&path)?;
                    let tasks = Self::get_task_overview(&path)?;
                    let size = Self::get_size(&path)?;
                    let updated_at = Self::get_date_modified(&path)?;
                    let robot_type = Self::load_robot_type(&path)?;

                    datasets.push(Dataset {
                        repo_id: format!("{}/{}", nickname, dataset),
                        nickname,
                        dataset,
                        path: path.to_string_lossy().to_string(),
                        episodes,
                        tasks,
                        size,
                        updated_at: updated_at.to_string(),
                        robot_type,
                    });
                }
                current_index += 1;

                // Early exit if we've processed all we need
                if current_index >= end {
                    break;
                }
            }
        }

        Ok(datasets)
    }

    /// Create an empty paginated response
    fn create_empty_paginated_response(
        pagination: Option<PaginationParameters>,
    ) -> PaginatedResponse<Dataset> {
        let page = pagination.as_ref().and_then(|p| p.page).unwrap_or(1);
        let page_size = pagination.as_ref().and_then(|p| p.page_size).unwrap_or(20);

        PaginatedResponse {
            data: Vec::new(),
            total: 0,
            page,
            page_size,
            total_pages: 0,
            has_next: false,
            has_previous: false,
        }
    }

    //----------------------------------------------------------------------------
    // Dataset CRUD Functions
    //----------------------------------------------------------------------------
    pub async fn combine_datasets(app_handle: AppHandle, db_connection: DatabaseConnection, datasets: Vec<DatasetPath>, output_dataset: DatasetPath) -> Result<String, String> {
        let nickname = output_dataset.nickname.clone();

        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;

        fn dataset_path_to_string(dataset: DatasetPath) -> String {
            format!("{}/{}", dataset.nickname, dataset.dataset)
        }

        let dataset_paths: Vec<String> = datasets.iter().map(|d| dataset_path_to_string(d.clone())).collect();
        let dataset_paths_json = serde_json::to_string(&dataset_paths).unwrap();
        let dataset_paths_string = format!("--dataset_paths={}", dataset_paths_json);

        let output_path = dataset_path_to_string(output_dataset.clone());
        let output_path_string = format!("--output_path={}", output_path);
        let command_parts = vec![
            "python".to_string(),
            "src/lerobot/datasets/combine_dataset/combine_dataset.py".to_string(),
            dataset_paths_string,
            output_path_string,
        ];

        // Use command_parts for execution
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
            .spawn()
            .map_err(|e| format!("Failed to combine datasets: {}", e))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let shutdown_flag = Arc::new(AtomicBool::new(false));

        let command_string = command_parts.join(" ");
        let command_log_service = CommandLogService::new(db_connection.clone());
        let command_log = CommandLogActiveModel::new()
            .with_command(command_string)
            .with_status("success".to_string())
            .with_started_at(chrono::Utc::now())
            .with_completed_at(chrono::Utc::now())
            .with_execution_time(0);

        let added_command_log = match command_log_service
            .add_command_log(command_log.clone().into())
            .await
        {
            Ok(log) => log,
            Err(e) => {
                eprintln!("Failed to add command log: {}", e);
                return Err(format!("Failed to add command log: {}", e));
            }
        };

         // Start logging for stdout and stderr
         LogService::start_logger(
             stdout,
             &app_handle,
             &shutdown_flag,
             Some(&nickname),
             Some("combine-datasets-log"),
             None,
             true,
             false,
         );

         LogService::start_logger(
             stderr,
             &app_handle,
             &shutdown_flag,
             Some(&nickname),
             Some("combine-datasets-log"),
             None,
             true,
             false,
         );

        Ok(added_command_log.id.clone())
    }

    //----------------------------------------------------------------------------
    // Dataset Specific Data Functions
    //----------------------------------------------------------------------------

    fn get_task_overview(dataset_path: &PathBuf) -> Result<TaskOverview, String> {
        let tasks_path = dataset_path.join("meta").join("tasks.jsonl");

        if !tasks_path.exists() {
            return Ok(TaskOverview {
                task_list: Vec::new(),
                total_tasks: 0,
            });
        }

        let tasks_content = fs::read_to_string(&tasks_path)
            .map_err(|e| format!("Failed to read tasks.jsonl at {:?}: {}", tasks_path, e))?;

        let mut tasks = Vec::new();

        for line in tasks_content.lines() {
            if line.trim().is_empty() {
                continue;
            }

            let task_data: serde_json::Value = serde_json::from_str(line)
                .map_err(|e| format!("Failed to parse task line '{}': {}", line, e))?;

            if let Some(task_text) = task_data["task"].as_str() {
                tasks.push(task_text.to_string());
            }
        }

        // Get the first 10 tasks (or all if less than 10)
        let task_list = tasks.iter().take(10).cloned().collect();

        Ok(TaskOverview {
            task_list,
            total_tasks: tasks.len(),
        })
    }

    pub fn get_size(dataset_path: &PathBuf) -> Result<usize, String> {
        if !dataset_path.exists() {
            return Ok(0);
        }

        if !dataset_path.is_dir() {
            // If it's a file, return its size
            let metadata = fs::metadata(dataset_path)
                .map_err(|e| format!("Failed to get metadata for {:?}: {}", dataset_path, e))?;
            return Ok(metadata.len() as usize);
        }

        let mut total_size = 0usize;
        total_size += DatasetParquetService::calculate_data_size(&dataset_path)?;
        total_size += DatasetVideoService::calculate_video_size(&dataset_path)?;

        Ok(total_size)
    }

    fn get_date_modified(dataset_path: &PathBuf) -> Result<String, String> {
        if !dataset_path.exists() {
            return Ok("Unknown".to_string());
        }

        let metadata = fs::metadata(dataset_path)
            .map_err(|e| format!("Failed to get metadata for {:?}: {}", dataset_path, e))?;

        let modified_time = metadata.modified().map_err(|e| {
            format!(
                "Failed to get modification time for {:?}: {}",
                dataset_path, e
            )
        })?;

        // Convert to a readable date format
        let datetime: chrono::DateTime<chrono::Utc> = chrono::DateTime::from(modified_time);
        Ok(datetime.format("%Y-%m-%d %H:%M:%S").to_string())
    }

    /// Load robot type from dataset info.json file
    pub fn load_robot_type(dataset_path: &PathBuf) -> Result<String, String> {
        let info_path = dataset_path.join("meta").join("info.json");
        if !info_path.exists() {
            return Ok("unknown".to_string());
        }

        let info_content = fs::read_to_string(&info_path)
            .map_err(|e| format!("Failed to read info.json: {}", e))?;

        let info: serde_json::Value = serde_json::from_str(&info_content)
            .map_err(|e| format!("Failed to parse info.json: {}", e))?;

        let robot_type = info
            .get("robot_type")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        Ok(robot_type)
    }
}
