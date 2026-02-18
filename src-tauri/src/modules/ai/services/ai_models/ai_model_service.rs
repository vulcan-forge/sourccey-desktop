use crate::modules::ai::types::ai_models::ai_model_types::{
    AIModel, HuggingFaceDownloadProgressEvent, HuggingFaceModelDownloadCompletionEvent,
    HuggingFaceModelDeleteResult, HuggingFaceModelDownloadResponse, HuggingFaceModelDownloadResult,
    HuggingFaceOrganizationCatalog, TrainingConfig,
};
use crate::services::directory::directory_service::DirectoryService;
use crate::services::environment::env_service::EnvService;
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use serde::de::DeserializeOwned;
use serde_json;
use std::collections::VecDeque;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use tauri::{AppHandle, Emitter};

static HUGGINGFACE_DOWNLOAD_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

struct HuggingFaceDownloadGuard;

impl Drop for HuggingFaceDownloadGuard {
    fn drop(&mut self) {
        HUGGINGFACE_DOWNLOAD_IN_PROGRESS.store(false, Ordering::Release);
    }
}

pub struct AIModelService;

impl AIModelService {
    pub fn start_huggingface_model_download(
        app_handle: &AppHandle,
        repo_input: &str,
        replace_existing: bool,
    ) -> Result<(), String> {
        if HUGGINGFACE_DOWNLOAD_IN_PROGRESS
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Err("Another model download is already in progress. Wait for it to finish.".to_string());
        }

        let app_handle = app_handle.clone();
        let repo_input_owned = repo_input.to_string();

        let spawn_result = thread::Builder::new()
            .name("hf-model-download".to_string())
            .spawn(move || {
                let _download_guard = HuggingFaceDownloadGuard;
                let response = match Self::download_huggingface_model_to_cache_with_progress(
                    &app_handle,
                    &repo_input_owned,
                    replace_existing,
                ) {
                    Ok(response) => response,
                    Err(error_message) => HuggingFaceModelDownloadResponse {
                        status: "failed".to_string(),
                        message: error_message,
                        result: None,
                    },
                };

                let repo_id = response
                    .result
                    .as_ref()
                    .map(|result| result.model.repo_id.clone())
                    .unwrap_or_else(|| repo_input_owned.clone());

                let completion_event = HuggingFaceModelDownloadCompletionEvent {
                    repo_id,
                    response,
                };
                let _ = app_handle.emit("hf-model-download-complete", completion_event);
            });

        if let Err(spawn_error) = spawn_result {
            HUGGINGFACE_DOWNLOAD_IN_PROGRESS.store(false, Ordering::Release);
            return Err(format!(
                "Failed to start download worker thread: {}",
                spawn_error
            ));
        }

        Ok(())
    }

    pub fn download_model_from_huggingface(repo_input: &str) -> Result<AIModel, String> {
        let (repo_owner, model_name) = Self::normalize_huggingface_model_input(repo_input)?;
        let full_repo_id = format!("{}/{}", repo_owner, model_name);

        let model_repository_path =
            DirectoryService::get_lerobot_ai_model_repository_path(&repo_owner)?;
        fs::create_dir_all(&model_repository_path)
            .map_err(|e| format!("Failed to create model repository directory: {}", e))?;

        let model_path = DirectoryService::get_lerobot_ai_model_path(&repo_owner, &model_name)?;
        fs::create_dir_all(&model_path)
            .map_err(|e| format!("Failed to create model directory: {}", e))?;

        let python_path = DirectoryService::get_python_path()?;
        let download_script = r#"
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

        let mut command = Command::new(python_path);
        command
            .arg("-c")
            .arg(download_script)
            .arg(full_repo_id)
            .arg(model_path.to_string_lossy().to_string());

        EnvService::add_python_env_vars(&mut command)?;

        let output = command
            .output()
            .map_err(|e| format!("Failed to launch Hugging Face model download process: {}", e))?;

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

        Self::get_ai_model(&repo_owner, &model_name)
    }

    pub fn get_huggingface_organization_catalog(
        organization: &str,
    ) -> Result<HuggingFaceOrganizationCatalog, String> {
        let organization = organization.trim();
        if !Self::is_safe_org_name(organization) {
            return Err("Invalid Hugging Face organization name".to_string());
        }

        let script = r#"
import json
import os
import shutil
import sys
from pathlib import Path
from huggingface_hub import HfApi, scan_cache_dir
from huggingface_hub.constants import HUGGINGFACE_HUB_CACHE

org = sys.argv[1].strip()
if not org:
    raise ValueError("Hugging Face organization cannot be empty")

cache_dir = Path(os.environ.get("HF_HUB_CACHE") or HUGGINGFACE_HUB_CACHE)
cache_dir.mkdir(parents=True, exist_ok=True)
free_bytes = shutil.disk_usage(cache_dir).free

downloaded_snapshots = {}
try:
    cache_info = scan_cache_dir(cache_dir=str(cache_dir))
    for repo in cache_info.repos:
        if getattr(repo, "repo_type", None) != "model":
            continue
        repo_id = getattr(repo, "repo_id", None)
        if not repo_id:
            continue
        latest = None
        for revision in (getattr(repo, "revisions", None) or []):
            snapshot_path = getattr(revision, "snapshot_path", None)
            if not snapshot_path:
                continue
            last_modified = getattr(revision, "last_modified", None)
            if latest is None or (last_modified and last_modified > latest[0]):
                latest = (last_modified, snapshot_path)
        if latest:
            downloaded_snapshots[repo_id] = str(latest[1])
except Exception:
    downloaded_snapshots = downloaded_snapshots

def parse_int(value):
    try:
        return int(value)
    except Exception:
        return None

def extract_size_bytes(model):
    safetensors = getattr(model, "safetensors", None)
    if isinstance(safetensors, dict):
        total = parse_int(safetensors.get("total"))
        if total is not None:
            return total

    siblings = getattr(model, "siblings", None) or []
    total_size = 0
    has_sizes = False
    for sibling in siblings:
        size = parse_int(getattr(sibling, "size", None))
        if size is not None:
            total_size += size
            has_sizes = True
    return total_size if has_sizes else None

def find_checkpoint_info(snapshot_path):
    if not snapshot_path:
        return (None, None)
    checkpoints_dir = Path(snapshot_path) / "checkpoints"
    if not checkpoints_dir.exists() or not checkpoints_dir.is_dir():
        return (None, None)

    best = None
    for child in checkpoints_dir.iterdir():
        if not child.is_dir():
            continue
        try:
            step = int(child.name)
        except Exception:
            continue
        if best is None or step > best[0]:
            best = (step, child)

    if best is None:
        return (None, None)

    pretrained = best[1] / "pretrained_model"
    pretrained_path = str(pretrained) if pretrained.exists() and pretrained.is_dir() else None
    return (best[0], pretrained_path)

api = HfApi()
models = []
for model in api.list_models(author=org, full=True, cardData=True, sort="downloads", direction=-1, limit=200):
    repo_id = getattr(model, "id", None)
    if not repo_id:
        continue

    model_name = repo_id.split("/")[-1]
    description = None
    card_data = getattr(model, "cardData", None)
    if isinstance(card_data, dict):
        raw = card_data.get("description")
        if isinstance(raw, str):
            description = raw.strip() or None
    if not description:
        raw = getattr(model, "description", None)
        if isinstance(raw, str):
            description = raw.strip() or None

    size_bytes = extract_size_bytes(model)
    snapshot_path = downloaded_snapshots.get(repo_id)
    downloaded = snapshot_path is not None
    highest_checkpoint_step, pretrained_model_path = find_checkpoint_info(snapshot_path)
    has_enough_space = True if downloaded else (None if size_bytes is None else free_bytes >= size_bytes)

    last_modified = getattr(model, "last_modified", None)
    models.append({
        "repo_id": repo_id,
        "model_name": model_name,
        "description": description,
        "size_bytes": size_bytes,
        "downloads": parse_int(getattr(model, "downloads", None)),
        "likes": parse_int(getattr(model, "likes", None)),
        "last_modified": str(last_modified) if last_modified is not None else None,
        "downloaded": downloaded,
        "snapshot_path": snapshot_path,
        "highest_checkpoint_step": highest_checkpoint_step,
        "pretrained_model_path": pretrained_model_path,
        "has_enough_space": has_enough_space,
    })

payload = {
    "organization": org,
    "cache_path": str(cache_dir),
    "free_bytes": int(free_bytes),
    "models": models,
}

print(json.dumps(payload, ensure_ascii=False))
"#;

        let args = vec![organization.to_string()];
        Self::run_python_json_script(script, &args)
    }

    pub fn download_huggingface_model_to_cache(
        repo_input: &str,
    ) -> Result<HuggingFaceModelDownloadResult, String> {
        let (repo_owner, model_name) = Self::normalize_huggingface_model_input(repo_input)?;
        let repo_id = format!("{}/{}", repo_owner, model_name);

        let script = r#"
import json
import os
import shutil
import sys
from pathlib import Path
from huggingface_hub import HfApi, snapshot_download
from huggingface_hub.constants import HUGGINGFACE_HUB_CACHE

repo_id = sys.argv[1].strip()
if not repo_id or "/" not in repo_id:
    raise ValueError("Invalid model repository id")

cache_dir = Path(os.environ.get("HF_HUB_CACHE") or HUGGINGFACE_HUB_CACHE)
cache_dir.mkdir(parents=True, exist_ok=True)
free_bytes_before = shutil.disk_usage(cache_dir).free

def parse_int(value):
    try:
        return int(value)
    except Exception:
        return None

def extract_size_bytes(model_info):
    safetensors = getattr(model_info, "safetensors", None)
    if isinstance(safetensors, dict):
        total = parse_int(safetensors.get("total"))
        if total is not None:
            return total

    siblings = getattr(model_info, "siblings", None) or []
    total_size = 0
    has_sizes = False
    for sibling in siblings:
        size = parse_int(getattr(sibling, "size", None))
        if size is not None:
            total_size += size
            has_sizes = True
    return total_size if has_sizes else None

def find_checkpoint_info(snapshot_path):
    checkpoints_dir = Path(snapshot_path) / "checkpoints"
    if not checkpoints_dir.exists() or not checkpoints_dir.is_dir():
        return (None, None)

    best = None
    for child in checkpoints_dir.iterdir():
        if not child.is_dir():
            continue
        try:
            step = int(child.name)
        except Exception:
            continue
        if best is None or step > best[0]:
            best = (step, child)

    if best is None:
        return (None, None)

    pretrained = best[1] / "pretrained_model"
    pretrained_path = str(pretrained) if pretrained.exists() and pretrained.is_dir() else None
    return (best[0], pretrained_path)

api = HfApi()
model_info = api.model_info(repo_id=repo_id, files_metadata=True)
size_bytes = extract_size_bytes(model_info)

snapshot_path = snapshot_download(repo_id=repo_id, repo_type="model")
free_bytes_after = shutil.disk_usage(cache_dir).free

description = None
card_data = getattr(model_info, "cardData", None)
if isinstance(card_data, dict):
    raw = card_data.get("description")
    if isinstance(raw, str):
        description = raw.strip() or None
if not description:
    raw = getattr(model_info, "description", None)
    if isinstance(raw, str):
        description = raw.strip() or None

highest_checkpoint_step, pretrained_model_path = find_checkpoint_info(snapshot_path)
has_enough_space = None if size_bytes is None else free_bytes_before >= size_bytes

last_modified = getattr(model_info, "last_modified", None)
payload = {
    "cache_path": str(cache_dir),
    "free_bytes_before": int(free_bytes_before),
    "free_bytes_after": int(free_bytes_after),
    "model": {
        "repo_id": repo_id,
        "model_name": repo_id.split("/")[-1],
        "description": description,
        "size_bytes": size_bytes,
        "downloads": parse_int(getattr(model_info, "downloads", None)),
        "likes": parse_int(getattr(model_info, "likes", None)),
        "last_modified": str(last_modified) if last_modified is not None else None,
        "downloaded": True,
        "snapshot_path": str(snapshot_path),
        "highest_checkpoint_step": highest_checkpoint_step,
        "pretrained_model_path": pretrained_model_path,
        "has_enough_space": has_enough_space,
    },
}

print(json.dumps(payload, ensure_ascii=False))
"#;

        let args = vec![repo_id];
        Self::run_python_json_script(script, &args)
    }

    pub fn delete_huggingface_model_from_cache(
        repo_input: &str,
    ) -> Result<HuggingFaceModelDeleteResult, String> {
        let (repo_owner, model_name) = Self::normalize_huggingface_model_input(repo_input)?;
        let repo_id = format!("{}/{}", repo_owner, model_name);

        let script = r#"
import json
import os
import shutil
import sys
from pathlib import Path
from huggingface_hub.constants import HUGGINGFACE_HUB_CACHE

repo_id = sys.argv[1].strip()
if not repo_id or "/" not in repo_id:
    raise ValueError("Invalid model repository id")

cache_dir = Path(os.environ.get("HF_HUB_CACHE") or HUGGINGFACE_HUB_CACHE)
cache_dir.mkdir(parents=True, exist_ok=True)
free_bytes_before = shutil.disk_usage(cache_dir).free

repo_token = repo_id.replace("/", "--")
repo_cache_dir = cache_dir / f"models--{repo_token}"

deleted = False
if repo_cache_dir.exists():
    shutil.rmtree(repo_cache_dir, ignore_errors=True)
    deleted = not repo_cache_dir.exists()

free_bytes_after = shutil.disk_usage(cache_dir).free
payload = {
    "status": "deleted" if deleted else "not_found",
    "message": "Model removed from Hugging Face cache." if deleted else "Model was not found in Hugging Face cache.",
    "repo_id": repo_id,
    "free_bytes_before": int(free_bytes_before),
    "free_bytes_after": int(free_bytes_after),
}
print(json.dumps(payload, ensure_ascii=False))
"#;

        let args = vec![repo_id];
        Self::run_python_json_script(script, &args)
    }

    pub fn download_huggingface_model_to_cache_with_progress(
        app_handle: &AppHandle,
        repo_input: &str,
        replace_existing: bool,
    ) -> Result<HuggingFaceModelDownloadResponse, String> {
        let (repo_owner, model_name) = Self::normalize_huggingface_model_input(repo_input)?;
        let repo_id = format!("{}/{}", repo_owner, model_name);

        let script = r#"
import json
import os
import shutil
import sys
import threading
import time
from pathlib import Path
from huggingface_hub import HfApi, snapshot_download
from huggingface_hub.constants import HUGGINGFACE_HUB_CACHE

repo_id = sys.argv[1].strip()
replace_existing = sys.argv[2].strip().lower() == "true"
if not repo_id or "/" not in repo_id:
    raise ValueError("Invalid model repository id")

cache_dir = Path(os.environ.get("HF_HUB_CACHE") or HUGGINGFACE_HUB_CACHE)
cache_dir.mkdir(parents=True, exist_ok=True)
free_bytes_before = shutil.disk_usage(cache_dir).free

def emit_progress(status_text, progress_percent=None):
    payload = {
        "type": "progress",
        "repo_id": repo_id,
        "status_text": status_text,
        "progress_percent": progress_percent,
    }
    print(json.dumps(payload, ensure_ascii=False), flush=True)

def emit_result(payload):
    print(json.dumps({"type": "result", "payload": payload}, ensure_ascii=False), flush=True)

def parse_int(value):
    try:
        return int(value)
    except Exception:
        return None

def format_bytes(value):
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(max(0, value))
    unit_index = 0
    while size >= 1024.0 and unit_index < len(units) - 1:
        size /= 1024.0
        unit_index += 1
    if size >= 100:
        precision = 0
    elif size >= 10:
        precision = 1
    else:
        precision = 2
    return f"{size:.{precision}f} {units[unit_index]}"

def extract_size_bytes(model_info):
    safetensors = getattr(model_info, "safetensors", None)
    if isinstance(safetensors, dict):
        total = parse_int(safetensors.get("total"))
        if total is not None:
            return total

    siblings = getattr(model_info, "siblings", None) or []
    total_size = 0
    has_sizes = False
    for sibling in siblings:
        size = parse_int(getattr(sibling, "size", None))
        if size is not None:
            total_size += size
            has_sizes = True
    return total_size if has_sizes else None

def get_repo_cache_dir(cache_root, target_repo_id):
    repo_token = target_repo_id.replace("/", "--")
    return Path(cache_root) / f"models--{repo_token}"

def find_snapshot_for_repo(cache_root, target_repo_id):
    repo_cache_dir = get_repo_cache_dir(cache_root, target_repo_id)
    snapshots_dir = repo_cache_dir / "snapshots"
    if not snapshots_dir.exists() or not snapshots_dir.is_dir():
        return None

    latest = None
    for child in snapshots_dir.iterdir():
        if not child.is_dir():
            continue
        try:
            modified_at = child.stat().st_mtime
        except Exception:
            modified_at = 0
        if latest is None or modified_at > latest[0]:
            latest = (modified_at, child)
    return str(latest[1]) if latest is not None else None

def find_checkpoint_info(snapshot_path):
    if not snapshot_path:
        return (None, None)
    checkpoints_dir = Path(snapshot_path) / "checkpoints"
    if not checkpoints_dir.exists() or not checkpoints_dir.is_dir():
        return (None, None)

    best = None
    for child in checkpoints_dir.iterdir():
        if not child.is_dir():
            continue
        try:
            step = int(child.name)
        except Exception:
            continue
        if best is None or step > best[0]:
            best = (step, child)

    if best is None:
        return (None, None)

    pretrained = best[1] / "pretrained_model"
    pretrained_path = str(pretrained) if pretrained.exists() and pretrained.is_dir() else None
    return (best[0], pretrained_path)

api = HfApi()
emit_progress("Starting download check...", 0.0)
model_info = api.model_info(repo_id=repo_id, files_metadata=True)
size_bytes = extract_size_bytes(model_info)

existing_snapshot = find_snapshot_for_repo(cache_dir, repo_id)
if existing_snapshot and not replace_existing:
    highest_checkpoint_step, pretrained_model_path = find_checkpoint_info(existing_snapshot)
    description = None
    card_data = getattr(model_info, "cardData", None)
    if isinstance(card_data, dict):
        raw = card_data.get("description")
        if isinstance(raw, str):
            description = raw.strip() or None
    if not description:
        raw = getattr(model_info, "description", None)
        if isinstance(raw, str):
            description = raw.strip() or None

    last_modified = getattr(model_info, "last_modified", None)
    payload = {
        "status": "replace_required",
        "message": "Model already exists in Hugging Face cache. Confirm to replace it.",
        "result": {
            "cache_path": str(cache_dir),
            "free_bytes_before": int(free_bytes_before),
            "free_bytes_after": int(free_bytes_before),
            "model": {
                "repo_id": repo_id,
                "model_name": repo_id.split("/")[-1],
                "description": description,
                "size_bytes": size_bytes,
                "downloads": parse_int(getattr(model_info, "downloads", None)),
                "likes": parse_int(getattr(model_info, "likes", None)),
                "last_modified": str(last_modified) if last_modified is not None else None,
                "downloaded": True,
                "snapshot_path": existing_snapshot,
                "highest_checkpoint_step": highest_checkpoint_step,
                "pretrained_model_path": pretrained_model_path,
                "has_enough_space": True,
            },
        },
    }
    emit_progress("Model already exists. Waiting for replace confirmation.", 100.0)
    emit_result(payload)
    sys.exit(0)

force_download = bool(replace_existing and existing_snapshot)
if force_download:
    emit_progress("Refreshing cached model download...", 2.0)

emit_progress("Downloading model files...", 0.0)
download_state = {
    "snapshot_path": None,
    "error": None,
    "done": False,
}

def run_snapshot_download():
    try:
        snapshot_path_value = snapshot_download(
            repo_id=repo_id,
            repo_type="model",
            force_download=force_download,
            max_workers=2,
        )
        download_state["snapshot_path"] = snapshot_path_value
    except Exception as exc:
        download_state["error"] = str(exc)
    finally:
        download_state["done"] = True

download_thread = threading.Thread(target=run_snapshot_download, daemon=True)
download_thread.start()

download_started_at = time.time()
last_emitted_percent = -1.0
while not download_state["done"]:
    elapsed_seconds = max(0.0, time.time() - download_started_at)
    free_now = shutil.disk_usage(cache_dir).free
    written_bytes = max(0, int(free_bytes_before - free_now))

    heartbeat_percent = min(95.0, 1.0 + elapsed_seconds * 0.4)
    if size_bytes is not None and size_bytes > 0:
        size_based_percent = min(99.0, max(0.0, (float(written_bytes) * 100.0) / float(size_bytes)))
        percent = max(heartbeat_percent, size_based_percent)
        detail = f"{format_bytes(written_bytes)} / {format_bytes(size_bytes)}"
    else:
        percent = heartbeat_percent
        detail = f"{format_bytes(written_bytes)} downloaded"

    if percent - last_emitted_percent >= 0.2:
        emit_progress(f"Downloading model files... {detail}", percent)
        last_emitted_percent = percent
    time.sleep(0.8)

download_thread.join()
if download_state["error"]:
    emit_progress("Download failed.", None)
    emit_result({
        "status": "failed",
        "message": download_state["error"],
        "result": None,
    })
    sys.exit(0)

snapshot_path = download_state["snapshot_path"]
if not snapshot_path:
    emit_progress("Download failed.", None)
    emit_result({
        "status": "failed",
        "message": "Download finished without a snapshot path.",
        "result": None,
    })
    sys.exit(0)
emit_progress("Finalizing download...", 100.0)

free_bytes_after = shutil.disk_usage(cache_dir).free
description = None
card_data = getattr(model_info, "cardData", None)
if isinstance(card_data, dict):
    raw = card_data.get("description")
    if isinstance(raw, str):
        description = raw.strip() or None
if not description:
    raw = getattr(model_info, "description", None)
    if isinstance(raw, str):
        description = raw.strip() or None

highest_checkpoint_step, pretrained_model_path = find_checkpoint_info(snapshot_path)
has_enough_space = None if size_bytes is None else free_bytes_before >= size_bytes
last_modified = getattr(model_info, "last_modified", None)

payload = {
    "status": "completed",
    "message": "Model downloaded to Hugging Face cache.",
    "result": {
        "cache_path": str(cache_dir),
        "free_bytes_before": int(free_bytes_before),
        "free_bytes_after": int(free_bytes_after),
        "model": {
            "repo_id": repo_id,
            "model_name": repo_id.split("/")[-1],
            "description": description,
            "size_bytes": size_bytes,
            "downloads": parse_int(getattr(model_info, "downloads", None)),
            "likes": parse_int(getattr(model_info, "likes", None)),
            "last_modified": str(last_modified) if last_modified is not None else None,
            "downloaded": True,
            "snapshot_path": str(snapshot_path),
            "highest_checkpoint_step": highest_checkpoint_step,
            "pretrained_model_path": pretrained_model_path,
            "has_enough_space": has_enough_space,
        },
    },
}

emit_progress("Download complete.", 100.0)
emit_result(payload)
"#;

        let args = vec![repo_id.clone(), replace_existing.to_string()];
        Self::run_python_json_script_with_progress(
            app_handle,
            script,
            &args,
            "hf-model-download-progress",
            &repo_id,
        )
    }

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
        let highest_checkpoint_step = Self::find_highest_checkpoint_step(&model_path)?;
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
            highest_checkpoint_step,
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
                    let highest_checkpoint_step = Self::find_highest_checkpoint_step(&path)?;

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
                        highest_checkpoint_step,
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
        let _ = repo_id;
        Ok(0)
    }

    /// Load robot type from dataset using DatasetService
    fn load_robot_type_from_dataset(repo_id: &str) -> Result<String, String> {
        let _ = repo_id;
        Ok("unknown".to_string())
    }

    /// Load training configuration from the checkpoint with the largest step count
    fn load_train_config(model_path: &PathBuf) -> Result<Option<TrainingConfig>, String> {
        let checkpoint_dir = Self::find_highest_checkpoint_dir(model_path)?.map(|(_, path)| path);

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

    fn find_highest_checkpoint_step(model_path: &Path) -> Result<Option<u32>, String> {
        Ok(
            Self::find_highest_checkpoint_dir(model_path)?
                .map(|(step_count, _)| step_count),
        )
    }

    fn find_highest_checkpoint_dir(model_path: &Path) -> Result<Option<(u32, PathBuf)>, String> {
        let checkpoints_path = model_path.join("checkpoints");
        if !checkpoints_path.exists() || !checkpoints_path.is_dir() {
            return Ok(None);
        }

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
            .max_by_key(|(step_count, _)| *step_count);

        Ok(checkpoint_dir)
    }

    fn normalize_huggingface_model_input(input: &str) -> Result<(String, String), String> {
        let mut value = input.trim();
        if value.is_empty() {
            return Err("Hugging Face repository cannot be empty".to_string());
        }

        if let Some(stripped) = value.strip_prefix("https://") {
            value = stripped;
        } else if let Some(stripped) = value.strip_prefix("http://") {
            value = stripped;
        }

        if let Some(stripped) = value.strip_prefix("www.huggingface.co/") {
            value = stripped;
        } else if let Some(stripped) = value.strip_prefix("huggingface.co/") {
            value = stripped;
        } else if let Some(stripped) = value.strip_prefix("www.hf.co/") {
            value = stripped;
        } else if let Some(stripped) = value.strip_prefix("hf.co/") {
            value = stripped;
        }

        value = value
            .split('#')
            .next()
            .unwrap_or(value)
            .split('?')
            .next()
            .unwrap_or(value)
            .trim_matches('/');

        if value.is_empty() {
            return Err("Hugging Face repository cannot be empty".to_string());
        }

        let segments: Vec<&str> = value
            .split('/')
            .filter(|segment| !segment.trim().is_empty())
            .collect();

        let (repo_owner, model_name) = if segments.first() == Some(&"models") {
            if segments.len() < 3 {
                return Err(
                    "Invalid Hugging Face model path. Expected format: owner/model".to_string(),
                );
            }
            (segments[1], segments[2])
        } else {
            if segments.len() < 2 {
                return Err(
                    "Invalid Hugging Face model path. Expected format: owner/model".to_string(),
                );
            }
            if segments[0] == "datasets" || segments[0] == "spaces" {
                return Err("Only Hugging Face model repositories are supported".to_string());
            }
            (segments[0], segments[1])
        };

        let normalized_model_name = model_name.split('@').next().unwrap_or(model_name);

        if !Self::is_safe_repo_token(repo_owner) || !Self::is_safe_repo_token(normalized_model_name)
        {
            return Err(
                "Invalid Hugging Face repository. Only letters, numbers, '_', '-', and '.' are allowed in owner/model."
                    .to_string(),
            );
        }

        Ok((repo_owner.to_string(), normalized_model_name.to_string()))
    }

    fn is_safe_repo_token(value: &str) -> bool {
        if value.is_empty() || value.starts_with('.') || value.starts_with('-') {
            return false;
        }

        value.chars().all(|ch| {
            ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.'
        })
    }

    fn is_safe_org_name(value: &str) -> bool {
        Self::is_safe_repo_token(value)
    }

    fn run_python_json_script<T: DeserializeOwned>(
        script: &str,
        args: &[String],
    ) -> Result<T, String> {
        let python_path = DirectoryService::get_python_path()?;
        let mut command = Command::new(python_path);
        command.arg("-c").arg(script);
        for arg in args {
            command.arg(arg);
        }
        EnvService::add_python_env_vars(&mut command)?;

        let output = command
            .output()
            .map_err(|e| format!("Failed to launch Python command: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Err(if !stderr.is_empty() {
                stderr
            } else if !stdout.is_empty() {
                stdout
            } else {
                "Python command failed with unknown error".to_string()
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        serde_json::from_str::<T>(&stdout).map_err(|e| {
            format!(
                "Failed to parse Python JSON response: {}. Response: {}",
                e, stdout
            )
        })
    }

    fn run_python_json_script_with_progress<T: DeserializeOwned>(
        app_handle: &AppHandle,
        script: &str,
        args: &[String],
        progress_event_name: &str,
        fallback_repo_id: &str,
    ) -> Result<T, String> {
        const MAX_CAPTURED_LINES: usize = 200;
        const MAX_CAPTURED_STDERR_BYTES: usize = 64 * 1024;
        let python_path = DirectoryService::get_python_path()?;
        let mut command = Command::new(python_path);
        command
            .arg("-u")
            .arg("-c")
            .arg(script)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command.env("HF_HUB_DISABLE_PROGRESS_BARS", "1");
        command.env("TQDM_DISABLE", "1");
        for arg in args {
            command.arg(arg);
        }
        EnvService::add_python_env_vars(&mut command)?;

        let mut child = command
            .spawn()
            .map_err(|e| format!("Failed to launch Python command: {}", e))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture Python stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to capture Python stderr".to_string())?;

        let stderr_handle = thread::spawn(move || -> String {
            let mut reader = BufReader::new(stderr);
            let mut buffer = [0_u8; 8192];
            let mut collected: VecDeque<u8> = VecDeque::with_capacity(MAX_CAPTURED_STDERR_BYTES);

            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(read_count) => {
                        for byte in &buffer[..read_count] {
                            if collected.len() >= MAX_CAPTURED_STDERR_BYTES {
                                collected.pop_front();
                            }
                            collected.push_back(*byte);
                        }
                    }
                    Err(_) => break,
                }
            }

            let bytes: Vec<u8> = collected.into_iter().collect();
            String::from_utf8_lossy(&bytes).trim().to_string()
        });

        let mut result_payload: Option<String> = None;
        let mut raw_stdout_lines: VecDeque<String> = VecDeque::new();
        let reader = BufReader::new(stdout);
        for line_result in reader.lines() {
            let line = line_result.map_err(|e| format!("Failed reading Python stdout: {}", e))?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if raw_stdout_lines.len() >= MAX_CAPTURED_LINES {
                raw_stdout_lines.pop_front();
            }
            raw_stdout_lines.push_back(trimmed.to_string());

            if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
                let line_type = value
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default();
                if line_type == "progress" {
                    let progress_payload = HuggingFaceDownloadProgressEvent {
                        repo_id: value
                            .get("repo_id")
                            .and_then(|v| v.as_str())
                            .unwrap_or(fallback_repo_id)
                            .to_string(),
                        status_text: value
                            .get("status_text")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Downloading model...")
                            .to_string(),
                        progress_percent: value.get("progress_percent").and_then(|v| v.as_f64()),
                    };
                    let _ = app_handle.emit(progress_event_name, &progress_payload);
                } else if line_type == "result" {
                    if let Some(payload) = value.get("payload") {
                        result_payload = Some(payload.to_string());
                    }
                }
            }
        }

        let stderr_output = stderr_handle
            .join()
            .map_err(|_| "Failed joining stderr reader thread".to_string())?;

        let status = child
            .wait()
            .map_err(|e| format!("Failed waiting for Python command: {}", e))?;

        if !status.success() {
            return Err(if !stderr_output.is_empty() {
                stderr_output
            } else if !raw_stdout_lines.is_empty() {
                raw_stdout_lines.iter().cloned().collect::<Vec<_>>().join("\n")
            } else {
                "Python command failed with unknown error".to_string()
            });
        }

        if let Some(payload_json) = result_payload {
            return serde_json::from_str::<T>(&payload_json).map_err(|e| {
                format!(
                    "Failed to parse Python JSON result payload: {}. Payload: {}",
                    e, payload_json
                )
            });
        }

        let fallback_stdout = raw_stdout_lines.iter().cloned().collect::<Vec<_>>().join("\n");
        serde_json::from_str::<T>(&fallback_stdout).map_err(|e| {
            format!(
                "Failed to parse Python JSON response: {}. Response: {}",
                e, fallback_stdout
            )
        })
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
