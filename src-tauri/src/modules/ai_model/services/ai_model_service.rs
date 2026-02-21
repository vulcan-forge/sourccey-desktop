use crate::modules::ai_model::models::ai_model::{
    AiModel, AiModelColumn, ActiveModel as AiModelActiveModel, Entity as AiModelEntity,
};
use crate::services::directory::directory_service::DirectoryService;
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use chrono::Utc;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};

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
        app_handle: AppHandle,
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

        let use_custom_subdirectory = model_name.map(|name| !name.trim().is_empty()).unwrap_or(false);
        let model_path = if use_custom_subdirectory {
            DirectoryService::get_lerobot_ai_model_path(repo_id, &resolved_name)?
        } else {
            DirectoryService::get_lerobot_ai_model_repository_path(repo_id)?
        };
        std::fs::create_dir_all(&model_path).map_err(|e| format!("Failed to create model directory: {}", e))?;

        let python_path = DirectoryService::get_python_path()?;
        let downloader_script = r#"
import json
import threading
import time
from pathlib import Path
import sys

from huggingface_hub import HfApi, snapshot_download

repo_id = sys.argv[1]
local_dir = Path(sys.argv[2]).resolve()
download_cache_root = local_dir / ".cache" / "huggingface" / "download"

STALL_THRESHOLD_SECONDS = 30
HEARTBEAT_SECONDS = 1.0


def emit(payload):
    print(json.dumps(payload), flush=True)


def list_repo_files():
    files = []
    try:
        api = HfApi()
        for item in api.list_repo_tree(repo_id=repo_id, repo_type="model", recursive=True, expand=True):
            path = getattr(item, "path", None)
            size = getattr(item, "size", None)
            if path and isinstance(size, int) and size >= 0:
                files.append((path, size))
    except Exception as error:
        emit({"event": "metadata_error", "message": str(error)})
    return files


def get_file_size(path: Path):
    try:
        if path.exists():
            return path.stat().st_size
    except Exception:
        pass
    return 0


def get_incomplete_size(relative_path: str):
    parent = download_cache_root.joinpath(*relative_path.split("/")[:-1])
    if not parent.exists():
        return 0

    best = 0
    try:
        for candidate in parent.glob("*.incomplete"):
            size = get_file_size(candidate)
            if size > best:
                best = size
    except Exception:
        return best
    return best


repo_files = list_repo_files()
total_bytes = int(sum(size for _, size in repo_files if size > 0))
emit(
    {
        "event": "progress",
        "status": "starting",
        "progress": 0,
        "downloaded_bytes": 0,
        "total_bytes": total_bytes,
        "file_count": len(repo_files),
    }
)

monitor_state = {"done": False}


def compute_progress():
    downloaded_bytes = 0
    active_file = None
    active_file_bytes = 0
    active_file_total_bytes = 0

    for relative_path, expected_size in repo_files:
        if expected_size <= 0:
            continue

        final_path = local_dir.joinpath(*relative_path.split("/"))
        final_size = get_file_size(final_path)

        if final_size >= expected_size:
            downloaded_bytes += expected_size
            continue

        partial_size = max(final_size, get_incomplete_size(relative_path))
        partial_size = min(partial_size, expected_size)
        downloaded_bytes += partial_size

        if partial_size > 0 and partial_size < expected_size and partial_size > active_file_bytes:
            active_file = relative_path
            active_file_bytes = int(partial_size)
            active_file_total_bytes = int(expected_size)

    if total_bytes > 0:
        progress = int((downloaded_bytes / total_bytes) * 100)
    else:
        progress = 0

    return int(downloaded_bytes), int(progress), active_file, active_file_bytes, active_file_total_bytes


def monitor_progress():
    previous_bytes = 0
    previous_time = time.monotonic()
    last_change_time = previous_time

    while True:
        downloaded_bytes, progress, active_file, active_file_bytes, active_file_total_bytes = compute_progress()
        now = time.monotonic()

        elapsed = max(now - previous_time, 1e-6)
        delta = max(downloaded_bytes - previous_bytes, 0)
        speed_bps = int(delta / elapsed)

        if downloaded_bytes > previous_bytes:
            last_change_time = now

        stall_seconds = int(now - last_change_time)
        stalled = stall_seconds >= STALL_THRESHOLD_SECONDS and downloaded_bytes < total_bytes

        emit(
            {
                "event": "progress",
                "status": "stalled" if stalled else "downloading",
                "progress": progress,
                "downloaded_bytes": downloaded_bytes,
                "total_bytes": total_bytes,
                "speed_bps": speed_bps,
                "stall_seconds": stall_seconds,
                "active_file": active_file,
                "active_file_bytes": active_file_bytes,
                "active_file_total_bytes": active_file_total_bytes,
            }
        )

        previous_bytes = downloaded_bytes
        previous_time = now

        if monitor_state["done"]:
            break

        time.sleep(HEARTBEAT_SECONDS)


monitor_thread = threading.Thread(target=monitor_progress, daemon=True)
monitor_thread.start()

try:
    snapshot_download(
        repo_id=repo_id,
        repo_type="model",
        local_dir=str(local_dir),
        local_dir_use_symlinks=False,
    )
finally:
    monitor_state["done"] = True
    monitor_thread.join(timeout=5)
"#;

        let _ = app_handle.emit(
            "ai-model-download-progress",
            json!({
                "repoId": repo_id,
                "status": "starting",
                "progress": 0
            }),
        );

        let mut child = Command::new(python_path)
            .arg("-u")
            .arg("-c")
            .arg(downloader_script)
            .arg(repo_id)
            .arg(model_path.to_string_lossy().to_string())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to launch model download process: {}", e))?;

        let stdout = child.stdout.take().ok_or("Failed to capture download stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture download stderr")?;

        let stderr_handle = std::thread::spawn(move || {
            let mut buffer = String::new();
            let mut reader = BufReader::new(stderr);
            let _ = reader.read_to_string(&mut buffer);
            buffer
        });

        for line in BufReader::new(stdout).lines().flatten() {
            if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&line) {
                if payload.get("event").and_then(|v| v.as_str()) == Some("progress") {
                    let progress = payload.get("progress").and_then(|v| v.as_i64());
                    let status = payload
                        .get("status")
                        .and_then(|v| v.as_str())
                        .unwrap_or("downloading");
                    let downloaded_bytes = payload.get("downloaded_bytes").and_then(|v| v.as_i64());
                    let total_bytes = payload.get("total_bytes").and_then(|v| v.as_i64());
                    let speed_bps = payload.get("speed_bps").and_then(|v| v.as_i64());
                    let stall_seconds = payload.get("stall_seconds").and_then(|v| v.as_i64());
                    let active_file = payload.get("active_file").and_then(|v| v.as_str());
                    let active_file_bytes = payload.get("active_file_bytes").and_then(|v| v.as_i64());
                    let active_file_total_bytes = payload
                        .get("active_file_total_bytes")
                        .and_then(|v| v.as_i64());

                    let _ = app_handle.emit(
                        "ai-model-download-progress",
                        json!({
                            "repoId": repo_id,
                            "status": status,
                            "progress": progress,
                            "downloadedBytes": downloaded_bytes,
                            "totalBytes": total_bytes,
                            "speedBps": speed_bps,
                            "stallSeconds": stall_seconds,
                            "currentFile": active_file,
                            "currentFileBytes": active_file_bytes,
                            "currentFileTotalBytes": active_file_total_bytes,
                            "updatedAtEpochMs": Utc::now().timestamp_millis()
                        }),
                    );
                } else if payload.get("event").and_then(|v| v.as_str()) == Some("metadata_error") {
                    let message = payload
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Failed to read repository metadata for byte progress");
                    let _ = app_handle.emit(
                        "ai-model-download-progress",
                        json!({
                            "repoId": repo_id,
                            "status": "downloading",
                            "message": message
                        }),
                    );
                }
            }
        }

        let status = child.wait().map_err(|e| format!("Failed to wait for download: {}", e))?;
        let stderr_output = stderr_handle.join().unwrap_or_default().trim().to_string();

        if !status.success() {
            let message = if !stderr_output.is_empty() {
                stderr_output
            } else {
                "Unknown model download error".to_string()
            };
            let _ = app_handle.emit(
                "ai-model-download-progress",
                json!({
                    "repoId": repo_id,
                    "status": "error",
                    "message": message
                }),
            );
            return Err(message);
        }

        let _ = app_handle.emit(
            "ai-model-download-progress",
            json!({
                "repoId": repo_id,
                "status": "completed",
                "progress": 100
            }),
        );

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

    let mut stack = vec![root.to_path_buf()];
    while let Some(current_dir) = stack.pop() {
        let entries = match std::fs::read_dir(&current_dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };

            if name.starts_with('.') {
                continue;
            }

            if get_latest_checkpoint(&path).is_some() {
                results.push((name.to_string(), path.to_string_lossy().to_string()));
                continue;
            }

            stack.push(path);
        }
    }

    results.sort_by(|left, right| left.1.cmp(&right.1));
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
