use crate::modules::ai_model::models::ai_model::{
    AiModel, AiModelColumn, ActiveModel as AiModelActiveModel, Entity as AiModelEntity,
};
use crate::services::directory::directory_service::DirectoryService;
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use chrono::Utc;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiModelFilters {}

pub struct AiModelService {
    connection: DatabaseConnection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiModelSyncResult {
    pub added: usize,
    pub updated: usize,
    pub restored: usize,
    pub removed: usize,
}

impl AiModelService {
    pub fn new(connection: DatabaseConnection) -> Self {
        Self { connection }
    }

    //-------------------------------------------------------------------------//
    // Get AI Model by ID
    //-------------------------------------------------------------------------//
    pub async fn get_ai_model(&self, id: String) -> Result<Option<AiModel>, DbErr> {
        AiModelEntity::find_by_id(id)
            .filter(AiModelColumn::DeletedAt.is_null())
            .one(&self.connection)
            .await
    }

    //-------------------------------------------------------------------------//
    // Create AI Model
    //-------------------------------------------------------------------------//
    pub async fn add_ai_model(&self, model: AiModelActiveModel) -> Result<AiModel, DbErr> {
        model.insert(&self.connection).await
    }

    //-------------------------------------------------------------------------//
    // Update AI Model
    //-------------------------------------------------------------------------//
    pub async fn update_ai_model(&self, model: AiModelActiveModel) -> Result<AiModel, DbErr> {
        model.update(&self.connection).await
    }

    //-------------------------------------------------------------------------//
    // Delete AI Model (Soft Delete)
    //-------------------------------------------------------------------------//
    pub async fn delete_ai_model(&self, id: String) -> Result<(), DbErr> {
        let model = AiModelEntity::find_by_id(id)
            .one(&self.connection)
            .await?;

        if let Some(model) = model {
            let mut active: AiModelActiveModel = model.into();
            active.deleted_at = Set(Some(Utc::now()));
            active.updated_at = Set(Some(Utc::now()));
            active.update(&self.connection).await?;
        }

        Ok(())
    }

    //-------------------------------------------------------------------------//
    // Sync AI Models from Cache Directory
    //-------------------------------------------------------------------------//
    pub async fn sync_ai_models_from_cache(&self) -> Result<AiModelSyncResult, DbErr> {
        let cache_dir = get_ai_model_cache_dir();
        let model_dirs = list_model_dirs(&cache_dir);

        let mut existing = AiModelEntity::find().all(&self.connection).await?;
        let mut existing_by_path: HashMap<String, AiModel> = HashMap::new();

        for model in existing.drain(..) {
            existing_by_path.insert(model.model_path.clone(), model);
        }

        let mut added = 0;
        let mut updated = 0;
        let mut restored = 0;
        let mut seen_paths: HashSet<String> = HashSet::new();

        for (name, path) in model_dirs {
            seen_paths.insert(path.clone());
            let path_buf = PathBuf::from(&path);
            let model_path_relative = get_model_relative_path(&cache_dir, &path_buf);
            let latest_checkpoint = get_latest_checkpoint(&path_buf);
            if let Some(existing_model) = existing_by_path.get(&path) {
                let mut active: AiModelActiveModel = existing_model.clone().into();
                let mut changed = false;

                if existing_model.name != name {
                    active.name = Set(name.clone());
                    changed = true;
                }
                if existing_model.model_path_relative != model_path_relative {
                    active.model_path_relative = Set(model_path_relative.clone());
                    changed = true;
                }
                if existing_model.latest_checkpoint != latest_checkpoint {
                    active.latest_checkpoint = Set(latest_checkpoint);
                    changed = true;
                }
                if existing_model.deleted_at.is_some() {
                    active.deleted_at = Set(None);
                    changed = true;
                    restored += 1;
                }

                if changed {
                    active.updated_at = Set(Some(Utc::now()));
                    active.update(&self.connection).await?;
                    updated += 1;
                }
            } else {
                let model = AiModelActiveModel::new(
                    name,
                    path,
                    model_path_relative.clone(),
                    latest_checkpoint,
                );
                model.insert(&self.connection).await?;
                added += 1;
            }
        }

        let mut removed = 0;
        for (path, model) in existing_by_path {
            if seen_paths.contains(&path) {
                continue;
            }
            if model.deleted_at.is_none() {
                let mut active: AiModelActiveModel = model.into();
                active.deleted_at = Set(Some(Utc::now()));
                active.updated_at = Set(Some(Utc::now()));
                active.update(&self.connection).await?;
                removed += 1;
            }
        }

        Ok(AiModelSyncResult {
            added,
            updated,
            restored,
            removed,
        })
    }

    //-------------------------------------------------------------------------//
    // Get AI Models Paginated
    //-------------------------------------------------------------------------//
    pub async fn get_ai_models_paginated(
        &self,
        _filters: AiModelFilters,
        pagination: PaginationParameters,
    ) -> Result<PaginatedResponse<AiModel>, DbErr> {
        let page = pagination.page.unwrap_or(1);
        let page_size = pagination.page_size.unwrap_or(20);
        let offset = (page - 1) * page_size;

        let query = AiModelEntity::find().filter(AiModelColumn::DeletedAt.is_null());

        let total = query.clone().count(&self.connection).await? as usize;
        let data = query
            .order_by_desc(AiModelColumn::CreatedAt)
            .offset(offset as u64)
            .limit(page_size as u64)
            .all(&self.connection)
            .await?;

        let total_pages = if page_size == 0 { 0 } else { (total + page_size - 1) / page_size };

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

    //-------------------------------------------------------------------------//
    // Download AI Model from Hugging Face
    //-------------------------------------------------------------------------//
    pub fn download_ai_model_from_huggingface(
        repo_id: &str,
        model_name: Option<&str>,
    ) -> Result<String, String> {
        if !is_safe_repo_id(repo_id) {
            return Err("Invalid repo_id".to_string());
        }

        let resolved_name = match model_name {
            Some(name) if !name.trim().is_empty() => name.trim().to_string(),
            _ => repo_id
                .split('/')
                .last()
                .map(|name| name.trim().to_string())
                .filter(|name| !name.is_empty())
                .ok_or_else(|| "Unable to derive model name from repo_id".to_string())?,
        };

        if !is_safe_model_name(&resolved_name) {
            return Err("Invalid model_name".to_string());
        }

        let model_path = DirectoryService::get_lerobot_ai_model_path(repo_id, &resolved_name)?;
        std::fs::create_dir_all(&model_path).map_err(|e| format!("Failed to create model directory: {}", e))?;

        let python_path = DirectoryService::get_python_path()?;
        let downloader_script = r#"
import sys
from huggingface_hub import snapshot_download

repo_id = sys.argv[1]
local_dir = sys.argv[2]

snapshot_download(
    repo_id=repo_id,
    repo_type="model",
    local_dir=local_dir,
    local_dir_use_symlinks=False,
)
"#;

        let output = Command::new(python_path)
            .arg("-c")
            .arg(downloader_script)
            .arg(repo_id)
            .arg(model_path.to_string_lossy().to_string())
            .output()
            .map_err(|e| format!("Failed to launch model download process: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Err(if !stderr.is_empty() {
                stderr
            } else if !stdout.is_empty() {
                stdout
            } else {
                "Unknown model download error".to_string()
            });
        }

        Ok("Model download completed".to_string())
    }
}

fn get_ai_model_cache_dir() -> PathBuf {
    if cfg!(target_os = "macos") {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        return home.join("Library").join("Caches").join("huggingface").join("lerobot").join("ai_models");
    }
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".cache").join("huggingface").join("lerobot").join("ai_models")
}

fn list_model_dirs(root: &Path) -> Vec<(String, String)> {
    let mut results = Vec::new();
    if !root.exists() {
        return results;
    }
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return results,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let path_str = path.to_string_lossy().to_string();
        results.push((name, path_str));
    }
    results
}

fn get_model_relative_path(root: &Path, full_path: &Path) -> Option<String> {
    if let Ok(relative) = full_path.strip_prefix(root) {
        let relative_str = relative.to_string_lossy().to_string();
        if !relative_str.is_empty() {
            return Some(relative_str);
        }
    }
    full_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_string())
}

fn get_latest_checkpoint(model_dir: &Path) -> Option<i64> {
    let checkpoints_dir = model_dir.join("checkpoints");
    if !checkpoints_dir.is_dir() {
        return None;
    }

    let mut max_step: Option<i64> = None;
    if let Ok(entries) = std::fs::read_dir(checkpoints_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            let Ok(step) = name.parse::<i64>() else {
                continue;
            };
            max_step = Some(match max_step {
                Some(current) => current.max(step),
                None => step,
            });
        }
    }

    max_step
}

fn is_safe_repo_id(value: &str) -> bool {
    if value.trim().is_empty() || value.starts_with('/') || value.contains('\\') || value.contains("..") {
        return false;
    }
    value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.' || ch == '/')
}

fn is_safe_model_name(value: &str) -> bool {
    if value.trim().is_empty() || value.starts_with('/') || value.contains('\\') || value.contains("..") || value.contains('/') {
        return false;
    }
    value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.' || ch == ' ')
}
