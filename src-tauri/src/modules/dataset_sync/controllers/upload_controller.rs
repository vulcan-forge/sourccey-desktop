use crate::modules::dataset_sync::services::upload_service::UploadService;
use crate::modules::dataset_sync::types::{
    DatasetSyncIdentity, DiscoveryReport, JobsReport, QueueDatasetMetadataRequest,
    QueuedDatasetMetadata,
};
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

#[tauri::command]
pub async fn get_dataset_sync_identity(
    app_handle: AppHandle,
) -> Result<DatasetSyncIdentity, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    UploadService::get_identity(db_manager.get_connection())
        .await
        .map_err(|error| format!("Failed to load dataset sync identity: {error}"))
}

#[tauri::command]
pub async fn queue_dataset_metadata(
    app_handle: AppHandle,
    request: QueueDatasetMetadataRequest,
) -> Result<QueuedDatasetMetadata, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    UploadService::queue_metadata(db_manager.get_connection(), request).await
}
