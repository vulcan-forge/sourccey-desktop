use crate::modules::ai::services::dataset::v3::dataset_service::DatasetService;
use crate::modules::ai::types::ai_models::ai_model_types::{AIModel, TrainingConfig};
use crate::services::directory::directory_service::DirectoryService;
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use serde_json;
use std::fs;
use std::path::PathBuf;

pub struct AIModelService;

impl AIModelService {
    /// Get all AI models across all user names with optional pagination
    pub fn get_all_ai_models(
        pagination: Option<PaginationParameters>,
    ) -> Result<PaginatedResponse<AIModel>, String> {
        let ai_models_path = DirectoryService::get_lerobot_ai_models_path()?;
        if !ai_models_path.exists() {
            return Ok(Self::create_empty_paginated_response(pagination));
        }

        if !ai_models_path.is_dir() {
            return Err(format!(
                "Cache path exists but is not a directory: {:?}",
                ai_models_path
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

        // First, count total models across all names to get total count
        let total = Self::count_all_ai_model_directories(&ai_models_path)?;

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

        // Now read only the models we need for this page
        let data = Self::read_all_ai_models_page(&ai_models_path, start, end)?;

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

    /// Get AI models for a specific name with optional pagination
    pub fn get_ai_models(
        repo_id: &str,
        pagination: Option<PaginationParameters>,
    ) -> Result<PaginatedResponse<AIModel>, String> {
        let model_repository_path =
            DirectoryService::get_lerobot_ai_model_repository_path(repo_id)?;
        if !model_repository_path.exists() {
            return Ok(Self::create_empty_paginated_response(pagination));
        }

        if !model_repository_path.is_dir() {
            return Err(format!(
                "Path exists but is not a directory: {:?}",
                model_repository_path
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
        let total = Self::count_ai_model_directories(&model_repository_path)?;

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
        let data = Self::read_ai_model_page(&model_repository_path, start, end)?;

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

    /// Get a specific AI model by its name
    pub fn get_ai_model(repo_id: &str, name: &str) -> Result<AIModel, String> {
        let model_path = DirectoryService::get_lerobot_ai_model_path(repo_id, name)?;
        if !model_path.exists() {
            return Err(format!("Model not found: {:?}", name));
        }

        if !model_path.is_dir() {
            return Err(format!(
                "Path exists but is not a directory: {:?}",
                model_path
            ));
        }

        let training_config = Self::load_train_config(&model_path)?;
        let full_repo_id = training_config
            .as_ref()
            .map(|config| config.dataset.repo_id.clone())
            .unwrap_or_else(|| "default_repo_id".to_string());

        let episodes = Self::count_episodes(&repo_id).unwrap_or(0);
        let robot_type = Self::load_robot_type_from_dataset(&full_repo_id)
            .unwrap_or_else(|_| "unknown".to_string());

        Ok(AIModel {
            repo_id: repo_id.to_string(),
            name: name.to_string(),
            path: model_path.to_string_lossy().to_string(),
            episodes,
            robot_type,
            training_config,
        })
    }

    /// Count the total number of model directories across all user names without loading them
    pub fn count_all_ai_model_directories(cache_path: &PathBuf) -> Result<usize, String> {
        let entries = fs::read_dir(cache_path)
            .map_err(|e| format!("Failed to read cache directory {:?}: {}", cache_path, e))?;

        let mut total_count = 0;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_dir() {
                // Count models for this name
                let name_count = Self::count_ai_model_directories(&path)?;
                total_count += name_count;
            }
        }

        Ok(total_count)
    }

    /// Read only the models for a specific page range across all user names
    fn read_all_ai_models_page(
        cache_path: &PathBuf,
        target_start: usize,
        target_end: usize,
    ) -> Result<Vec<AIModel>, String> {
        let entries = fs::read_dir(cache_path)
            .map_err(|e| format!("Failed to read cache directory {:?}: {}", cache_path, e))?;

        let mut models = Vec::new();
        let mut current_index = 0;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_dir() {
                // Count models for this name to know the range
                let count = Self::count_ai_model_directories(&path)?;
                let start = current_index;
                let end = current_index + count;

                // Check if this name's models overlap with our target range
                if end > target_start && start < target_end {
                    // Calculate the overlap
                    let overlap_start = std::cmp::max(target_start, start);
                    let overlap_end = std::cmp::min(target_end, end);

                    // Calculate the relative start/end within this name's models
                    let relative_start = overlap_start - start;
                    let relative_end = overlap_end - start;

                    // Read the overlapping models for this name
                    let model = Self::read_ai_model_page(&path, relative_start, relative_end)?;
                    models.extend(model);
                }

                current_index += count;

                // Early exit if we've processed all we need
                if current_index >= target_end {
                    break;
                }
            }
        }

        Ok(models)
    }

    /// Count the total number of model directories without loading them all
    pub fn count_ai_model_directories(models_path: &PathBuf) -> Result<usize, String> {
        let entries = fs::read_dir(models_path)
            .map_err(|e| format!("Failed to read directory {:?}: {}", models_path, e))?;

        let count = entries
            .filter_map(|entry| {
                entry
                    .ok()
                    .and_then(|e| if e.path().is_dir() { Some(()) } else { None })
            })
            .count();

        Ok(count)
    }

    /// Read only the model directories for a specific page range
    fn read_ai_model_page(
        models_path: &PathBuf,
        start: usize,
        end: usize,
    ) -> Result<Vec<AIModel>, String> {
        let entries = fs::read_dir(models_path)
            .map_err(|e| format!("Failed to read directory {:?}: {}", models_path, e))?;

        let mut models = Vec::new();
        let mut current_index = 0;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_dir() {
                // Only process directories in our target range
                if current_index >= start && current_index < end {
                    let name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let training_config = Self::load_train_config(&path)?;

                    // Get the repo_id from the parent directory (nickname/user)
                    let repo_id = path
                        .parent()
                        .and_then(|p| p.file_name())
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let episodes = Self::count_episodes(&repo_id).unwrap_or(0);
                    let robot_type = Self::load_robot_type_from_dataset(&repo_id)
                        .unwrap_or_else(|_| "unknown".to_string());
                    models.push(AIModel {
                        repo_id,
                        name,
                        path: path.to_string_lossy().to_string(),
                        episodes,
                        robot_type,
                        training_config,
                    });
                }
                current_index += 1;

                // Early exit if we've processed all we need
                if current_index >= end {
                    break;
                }
            }
        }

        Ok(models)
    }

    /// Count episodes for a dataset using the training data service
    pub fn count_episodes(repo_id: &str) -> Result<usize, String> {
        let dataset_path = DirectoryService::get_lerobot_dataset_path_from_repo_id(repo_id)?;
        return DatasetService::count_episodes(&dataset_path);
    }

    /// Load robot type from dataset using DatasetService
    fn load_robot_type_from_dataset(repo_id: &str) -> Result<String, String> {
        let dataset_path = DirectoryService::get_lerobot_dataset_path_from_repo_id(repo_id)?;
        return DatasetService::load_robot_type(&dataset_path);
    }

    /// Load training configuration from the checkpoint with the largest step count
    fn load_train_config(model_path: &PathBuf) -> Result<Option<TrainingConfig>, String> {
        let checkpoints_path = model_path.join("checkpoints");
        if !checkpoints_path.exists() || !checkpoints_path.is_dir() {
            return Ok(None);
        }

        // Find the checkpoint directory with the largest step count (highest numeric name)
        let checkpoint_dir = fs::read_dir(&checkpoints_path)
            .map_err(|e| format!("Failed to read checkpoints directory: {}", e))?
            .filter_map(|entry| {
                entry.ok().and_then(|e| {
                    let path = e.path();
                    if path.is_dir() {
                        path.file_name()
                            .and_then(|n| n.to_str())
                            .and_then(|s| s.parse::<u32>().ok())
                            .map(|step_count| (step_count, path))
                    } else {
                        None
                    }
                })
            })
            .max_by_key(|(step_count, _)| *step_count)
            .map(|(_, path)| path);

        if let Some(checkpoint_path) = checkpoint_dir {
            let config_path = checkpoint_path
                .join("pretrained_model")
                .join("train_config.json");

            if config_path.exists() {
                let config_content = fs::read_to_string(&config_path)
                    .map_err(|e| format!("Failed to read train_config.json: {}", e))?;

                let config: TrainingConfig = serde_json::from_str(&config_content)
                    .map_err(|e| format!("Failed to parse train_config.json: {}", e))?;

                Ok(Some(config))
            } else {
                Ok(None)
            }
        } else {
            Ok(None)
        }
    }

    /// Create an empty paginated response
    fn create_empty_paginated_response(
        pagination: Option<PaginationParameters>,
    ) -> PaginatedResponse<AIModel> {
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
}
