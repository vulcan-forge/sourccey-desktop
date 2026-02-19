use crate::modules::ai_model::models::ai_model::{
    AiModel, AiModelColumn, ActiveModel as AiModelActiveModel, Entity as AiModelEntity,
};
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use chrono::Utc;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

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
            if let Some(existing_model) = existing_by_path.get(&path) {
                let mut active: AiModelActiveModel = existing_model.clone().into();
                let mut changed = false;

                if existing_model.name != name {
                    active.name = Set(name.clone());
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
                let model = AiModelActiveModel::new(name, path);
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
