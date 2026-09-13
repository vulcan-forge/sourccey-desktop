use crate::modules::huggingface_upload::services::upload_service::UploadService;
use crate::modules::huggingface_upload::types::{DiscoveryReport, JobsReport};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn discover_upload_datasets() -> Result<DiscoveryReport, String> {
    tauri::async_runtime::spawn_blocking(UploadService::discover_datasets)
        .await
        .map_err(|error| format!("Dataset discovery task failed: {error}"))?
}

#[tauri::command]
pub async fn get_upload_jobs(app_handle: AppHandle) -> Result<JobsReport, String> {
    let database_path = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?
        .join("uploads")
        .join("uploads.sqlite3");

    tauri::async_runtime::spawn_blocking(move || UploadService::list_jobs(&database_path))
        .await
        .map_err(|error| format!("Upload status task failed: {error}"))?
}
