use crate::modules::ai_model::models::ai_model::{
    ActiveModel as AiModelActiveModel, AiModel, AiModelColumn, Entity as AiModelEntity,
};
use crate::services::directory::directory_service::DirectoryService;
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use crate::utils::windows_process::configure_std_command;
use chrono::Utc;
use lazy_static::lazy_static;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModelDownloadStatus {
    pub running: bool,
    pub repo_id: Option<String>,
    pub model_name: Option<String>,
    pub status: String,
    pub progress: Option<u8>,
    pub downloaded_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    pub speed_bps: Option<u64>,
    pub stall_seconds: u64,
    pub current_file: Option<String>,
    pub current_file_bytes: Option<u64>,
    pub current_file_total_bytes: Option<u64>,
    pub message: Option<String>,
    pub error: Option<String>,
    pub cancel_requested: bool,
    pub updated_at_epoch_ms: i64,
}

impl Default for AiModelDownloadStatus {
    fn default() -> Self {
        Self {
            running: false,
            repo_id: None,
            model_name: None,
            status: "idle".to_string(),
            progress: None,
            downloaded_bytes: None,
            total_bytes: None,
            speed_bps: None,
            stall_seconds: 0,
            current_file: None,
            current_file_bytes: None,
            current_file_total_bytes: None,
            message: None,
            error: None,
            cancel_requested: false,
            updated_at_epoch_ms: Utc::now().timestamp_millis(),
        }
    }
}

struct AiModelDownloadControl {
    cancel_requested: AtomicBool,
    child: Mutex<Option<Child>>,
}

lazy_static! {
    static ref AI_MODEL_DOWNLOAD_STATUS: Mutex<AiModelDownloadStatus> =
        Mutex::new(AiModelDownloadStatus::default());
    static ref AI_MODEL_DOWNLOAD_CONTROL: Mutex<Option<Arc<AiModelDownloadControl>>> =
        Mutex::new(None);
}

impl AiModelService {
    pub fn new(connection: DatabaseConnection) -> Self {
        Self { connection }
    }

    pub fn model_download_status() -> AiModelDownloadStatus {
        AI_MODEL_DOWNLOAD_STATUS
            .lock()
            .map(|status| status.clone())
            .unwrap_or_default()
    }

    pub fn begin_model_download(repo_id: &str, model_name: Option<&str>) -> Result<(), String> {
        if !is_safe_repo_id(repo_id) {
            return Err("Invalid repo_id".to_string());
        }
        if let Some(name) = model_name {
            if !name.trim().is_empty() && !is_safe_model_name(name.trim()) {
                return Err("Invalid model_name".to_string());
            }
        }

        let mut status = AI_MODEL_DOWNLOAD_STATUS
            .lock()
            .map_err(|_| "Model download status is unavailable".to_string())?;
        if status.running {
            let active = status.repo_id.as_deref().unwrap_or("another model");
            return Err(format!("A model download is already running for {active}."));
        }

        *status = AiModelDownloadStatus {
            running: true,
            repo_id: Some(repo_id.to_string()),
            model_name: model_name
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(str::to_string),
            status: "starting".to_string(),
            progress: Some(0),
            message: Some("Preparing Hugging Face download".to_string()),
            updated_at_epoch_ms: Utc::now().timestamp_millis(),
            ..AiModelDownloadStatus::default()
        };

        let control = Arc::new(AiModelDownloadControl {
            cancel_requested: AtomicBool::new(false),
            child: Mutex::new(None),
        });
        *AI_MODEL_DOWNLOAD_CONTROL
            .lock()
            .map_err(|_| "Model download control is unavailable".to_string())? = Some(control);
        Ok(())
    }

    pub fn cancel_model_download() -> Result<(), String> {
        {
            let mut status = AI_MODEL_DOWNLOAD_STATUS
                .lock()
                .map_err(|_| "Model download status is unavailable".to_string())?;
            if !status.running {
                return Err("There is no active model download to cancel.".to_string());
            }
            status.cancel_requested = true;
            status.status = "cancelling".to_string();
            status.message = Some("Cancelling model download".to_string());
            status.updated_at_epoch_ms = Utc::now().timestamp_millis();
        }

        let control = AI_MODEL_DOWNLOAD_CONTROL
            .lock()
            .map_err(|_| "Model download control is unavailable".to_string())?
            .clone()
            .ok_or_else(|| "Model download control is unavailable".to_string())?;
        control.cancel_requested.store(true, Ordering::SeqCst);
        if let Ok(mut child) = control.child.lock() {
            if let Some(process) = child.as_mut() {
                if let Err(error) = process.kill() {
                    let already_exited = process.try_wait().ok().flatten().is_some();
                    if !already_exited {
                        return Err(format!("Failed to cancel model download: {error}"));
                    }
                }
            }
        }
        Ok(())
    }

    pub fn finish_model_download(app_handle: &AppHandle, result: &Result<(), String>) {
        let cancelled = AI_MODEL_DOWNLOAD_CONTROL
            .lock()
            .ok()
            .and_then(|control| control.clone())
            .map(|control| control.cancel_requested.load(Ordering::SeqCst))
            .unwrap_or(false);

        if let Ok(mut status) = AI_MODEL_DOWNLOAD_STATUS.lock() {
            status.running = false;
            status.speed_bps = Some(0);
            status.updated_at_epoch_ms = Utc::now().timestamp_millis();
            match result {
                Ok(()) => {
                    status.status = "completed".to_string();
                    status.progress = Some(100);
                    status.message = Some("Model download complete".to_string());
                    status.error = None;
                }
                Err(_) if cancelled => {
                    status.status = "cancelled".to_string();
                    status.message = Some(
                        "Model download cancelled. Partial files were kept so it can resume later."
                            .to_string(),
                    );
                    status.error = None;
                }
                Err(error) => {
                    status.status = "error".to_string();
                    status.message = Some(error.clone());
                    status.error = Some(error.clone());
                }
            }
            let _ = app_handle.emit("ai-model-download-progress", status.clone());
        }
        if let Ok(mut control) = AI_MODEL_DOWNLOAD_CONTROL.lock() {
            *control = None;
        }
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
        let model = AiModelEntity::find_by_id(id).one(&self.connection).await?;

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
        // Use the same resolver as downloads and the "Open cache" action. Keeping
        // a second, platform-specific reconstruction here caused installed builds
        // to scan a different location as path handling evolved.
        let cache_dir = DirectoryService::get_lerobot_ai_models_path().map_err(DbErr::Custom)?;
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

        let total_pages = if page_size == 0 {
            0
        } else {
            (total + page_size - 1) / page_size
        };

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
    ) -> Result<(), String> {
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

        let use_custom_subdirectory = model_name
            .map(|name| !name.trim().is_empty())
            .unwrap_or(false);
        let model_path = if use_custom_subdirectory {
            DirectoryService::get_lerobot_ai_model_path(repo_id, &resolved_name)?
        } else {
            DirectoryService::get_lerobot_ai_model_repository_path(repo_id)?
        };
        std::fs::create_dir_all(&model_path)
            .map_err(|e| format!("Failed to create model directory: {}", e))?;

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

        let control = AI_MODEL_DOWNLOAD_CONTROL
            .lock()
            .map_err(|_| "Model download control is unavailable".to_string())?
            .clone()
            .ok_or_else(|| "Model download was not initialized".to_string())?;
        if control.cancel_requested.load(Ordering::SeqCst) {
            return Err("Model download cancelled".to_string());
        }
        let _ = app_handle.emit("ai-model-download-progress", Self::model_download_status());

        let mut command = Command::new(python_path);
        command
            .arg("-u")
            .arg("-c")
            .arg(downloader_script)
            .arg(repo_id)
            .arg(model_path.to_string_lossy().to_string())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        configure_std_command(&mut command);

        let mut child = command
            .spawn()
            .map_err(|e| format!("Failed to launch model download process: {}", e))?;

        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to capture download stdout")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("Failed to capture download stderr")?;

        {
            let mut active_child = control
                .child
                .lock()
                .map_err(|_| "Model download process control is unavailable".to_string())?;
            *active_child = Some(child);
            if control.cancel_requested.load(Ordering::SeqCst) {
                if let Some(process) = active_child.as_mut() {
                    let _ = process.kill();
                }
            }
        }

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
                    let active_file_bytes =
                        payload.get("active_file_bytes").and_then(|v| v.as_i64());
                    let active_file_total_bytes = payload
                        .get("active_file_total_bytes")
                        .and_then(|v| v.as_i64());

                    if let Ok(mut download) = AI_MODEL_DOWNLOAD_STATUS.lock() {
                        if !download.cancel_requested {
                            download.status = status.to_string();
                        }
                        download.progress =
                            progress.and_then(|value| u8::try_from(value.clamp(0, 100)).ok());
                        download.downloaded_bytes =
                            downloaded_bytes.and_then(|value| u64::try_from(value).ok());
                        download.total_bytes =
                            total_bytes.and_then(|value| u64::try_from(value).ok());
                        download.speed_bps = speed_bps.and_then(|value| u64::try_from(value).ok());
                        download.stall_seconds = stall_seconds
                            .and_then(|value| u64::try_from(value).ok())
                            .unwrap_or(0);
                        download.current_file = active_file.map(str::to_string);
                        download.current_file_bytes =
                            active_file_bytes.and_then(|value| u64::try_from(value).ok());
                        download.current_file_total_bytes =
                            active_file_total_bytes.and_then(|value| u64::try_from(value).ok());
                        download.updated_at_epoch_ms = Utc::now().timestamp_millis();
                    }

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
                    if let Ok(mut download) = AI_MODEL_DOWNLOAD_STATUS.lock() {
                        download.message = Some(message.to_string());
                        download.updated_at_epoch_ms = Utc::now().timestamp_millis();
                    }
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

        let status = {
            let mut active_child = control
                .child
                .lock()
                .map_err(|_| "Model download process control is unavailable".to_string())?;
            active_child
                .as_mut()
                .ok_or_else(|| "Model download process is unavailable".to_string())?
                .wait()
                .map_err(|e| format!("Failed to wait for download: {}", e))?
        };
        let stderr_output = stderr_handle.join().unwrap_or_default().trim().to_string();

        if control.cancel_requested.load(Ordering::SeqCst) {
            return Err("Model download cancelled".to_string());
        }

        if !status.success() {
            let message = if !stderr_output.is_empty() {
                stderr_output
            } else {
                "Unknown model download error".to_string()
            };
            return Err(message);
        }

        Ok(())
    }
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

            if is_discoverable_model_dir(&path) {
                results.push((name.to_string(), path.to_string_lossy().to_string()));
                continue;
            }

            stack.push(path);
        }
    }

    results.sort_by(|left, right| left.1.cmp(&right.1));
    results
}

fn is_discoverable_model_dir(path: &Path) -> bool {
    if get_latest_checkpoint(path).is_some() {
        return true;
    }

    // A Hugging Face policy snapshot is commonly runnable directly at its root
    // or from a pretrained_model directory, regardless of the host OS.
    path.join("config.json").is_file()
        || path.join("pretrained_model").join("config.json").is_file()
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
    if value.trim().is_empty()
        || value.starts_with('/')
        || value.contains('\\')
        || value.contains("..")
    {
        return false;
    }
    value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.' || ch == '/')
}

fn is_safe_model_name(value: &str) -> bool {
    if value.trim().is_empty()
        || value.starts_with('/')
        || value.contains('\\')
        || value.contains("..")
        || value.contains('/')
    {
        return false;
    }
    value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.' || ch == ' ')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reset_download_job() {
        *AI_MODEL_DOWNLOAD_STATUS
            .lock()
            .expect("download status lock") = AiModelDownloadStatus::default();
        *AI_MODEL_DOWNLOAD_CONTROL
            .lock()
            .expect("download control lock") = None;
    }

    #[test]
    fn download_job_persists_and_rejects_concurrent_downloads() {
        reset_download_job();

        AiModelService::begin_model_download("vulcan/example-model", None)
            .expect("first download should start");
        let running = AiModelService::model_download_status();
        assert!(running.running);
        assert_eq!(running.repo_id.as_deref(), Some("vulcan/example-model"));
        assert_eq!(running.status, "starting");

        let duplicate = AiModelService::begin_model_download("vulcan/other-model", None);
        assert!(duplicate.is_err());

        AiModelService::cancel_model_download().expect("download should be cancellable");
        let cancelling = AiModelService::model_download_status();
        assert!(cancelling.running);
        assert!(cancelling.cancel_requested);
        assert_eq!(cancelling.status, "cancelling");

        reset_download_job();
    }

    #[test]
    fn download_destination_is_inside_the_sync_cache_path() {
        let cache_path =
            DirectoryService::get_lerobot_ai_models_path().expect("model sync cache path");
        let download_path =
            DirectoryService::get_lerobot_ai_model_repository_path("vulcan/example-model")
                .expect("model download path");

        assert_eq!(
            download_path,
            cache_path.join("example-model"),
            "downloads must be written beneath the directory scanned by refresh"
        );
    }

    #[test]
    fn discovers_pretrained_model_layout_on_every_platform() {
        let root = std::env::temp_dir().join(format!(
            "vulcan-studio-ai-model-discovery-{}",
            uuid::Uuid::now_v7()
        ));
        let model_dir = root.join("example-model");
        let pretrained_dir = model_dir.join("pretrained_model");
        std::fs::create_dir_all(&pretrained_dir).expect("create test model directory");
        std::fs::write(pretrained_dir.join("config.json"), b"{}").expect("write model config");

        let models = list_model_dirs(&root);
        assert_eq!(
            models,
            vec![(
                "example-model".to_string(),
                model_dir.to_string_lossy().to_string()
            )]
        );

        std::fs::remove_dir_all(&root).expect("remove test model directory");
    }

    #[test]
    fn discovers_hugging_face_snapshot_layout_on_every_platform() {
        let root = std::env::temp_dir().join(format!(
            "vulcan-studio-ai-model-discovery-{}",
            uuid::Uuid::now_v7()
        ));
        let model_dir = root.join("example-model");
        std::fs::create_dir_all(&model_dir).expect("create test model directory");
        std::fs::write(model_dir.join("config.json"), b"{\"type\":\"act\"}")
            .expect("write model config");

        let models = list_model_dirs(&root);
        assert_eq!(
            models,
            vec![(
                "example-model".to_string(),
                model_dir.to_string_lossy().to_string()
            )]
        );

        std::fs::remove_dir_all(&root).expect("remove test model directory");
    }
}
