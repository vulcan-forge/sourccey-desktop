use crate::modules::ai_model::models::ai_model::AiModel;
use crate::modules::ai_model::services::ai_model_service::{
    AiModelDownloadStatus, AiModelFilters, AiModelService, AiModelSyncResult,
};
use crate::services::directory::directory_service::DirectoryService;
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use tauri::{AppHandle, Manager};

//-------------------------------------------------------------------------//
// Get AI Model
//-------------------------------------------------------------------------//
#[tauri::command]
pub async fn get_ai_model(app_handle: AppHandle, id: String) -> Result<Option<AiModel>, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let ai_model_service = AiModelService::new(db_manager.get_connection().clone());

    let model = ai_model_service
        .get_ai_model(id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(model)
}

//-------------------------------------------------------------------------//
// Add AI Model
//-------------------------------------------------------------------------//
#[tauri::command]
pub async fn add_ai_model(app_handle: AppHandle, model: AiModel) -> Result<AiModel, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let ai_model_service = AiModelService::new(db_manager.get_connection().clone());

    let model = ai_model_service
        .add_ai_model(model.into())
        .await
        .map_err(|e| e.to_string())?;

    Ok(model)
}

//-------------------------------------------------------------------------//
// Update AI Model
//-------------------------------------------------------------------------//
#[tauri::command]
pub async fn update_ai_model(app_handle: AppHandle, model: AiModel) -> Result<AiModel, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let ai_model_service = AiModelService::new(db_manager.get_connection().clone());

    let model = ai_model_service
        .update_ai_model(model.into())
        .await
        .map_err(|e| e.to_string())?;

    Ok(model)
}

//-------------------------------------------------------------------------//
// Delete AI Model
//-------------------------------------------------------------------------//
#[tauri::command]
pub async fn delete_ai_model(app_handle: AppHandle, id: String) -> Result<bool, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let ai_model_service = AiModelService::new(db_manager.get_connection().clone());

    ai_model_service
        .delete_ai_model(id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(true)
}

//-------------------------------------------------------------------------//
// Get AI Models Paginated
//-------------------------------------------------------------------------//
#[tauri::command]
pub async fn get_ai_models_paginated(
    app_handle: AppHandle,
    pagination: PaginationParameters,
) -> Result<PaginatedResponse<AiModel>, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let ai_model_service = AiModelService::new(db_manager.get_connection().clone());

    let models = ai_model_service
        .get_ai_models_paginated(AiModelFilters {}, pagination)
        .await
        .map_err(|e| e.to_string())?;

    Ok(models)
}

//-------------------------------------------------------------------------//
// Sync AI Models from Cache
//-------------------------------------------------------------------------//
#[tauri::command]
pub async fn sync_ai_models_from_cache(app_handle: AppHandle) -> Result<AiModelSyncResult, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let ai_model_service = AiModelService::new(db_manager.get_connection().clone());

    let result = ai_model_service
        .sync_ai_models_from_cache()
        .await
        .map_err(|e| e.to_string())?;

    Ok(result)
}

//-------------------------------------------------------------------------//
// Get AI Model Cache Path
//-------------------------------------------------------------------------//
#[tauri::command]
pub fn get_ai_model_cache_path() -> Result<String, String> {
    let path = DirectoryService::get_lerobot_ai_models_path()?;
    Ok(path.to_string_lossy().to_string())
}

//-------------------------------------------------------------------------//
// Download AI Model from Hugging Face
//-------------------------------------------------------------------------//
#[tauri::command]
pub async fn download_ai_model_from_huggingface(
    app_handle: AppHandle,
    repo_id: String,
    model_name: Option<String>,
) -> Result<String, String> {
    let repo_id = repo_id.trim().to_string();
    if repo_id.is_empty() {
        return Err("repo_id is required".to_string());
    }

    AiModelService::begin_model_download(&repo_id, model_name.as_deref())?;

    tauri::async_runtime::spawn(async move {
        let worker_app_handle = app_handle.clone();
        let worker_repo_id = repo_id.clone();
        let worker_model_name = model_name.clone();
        let mut result = tauri::async_runtime::spawn_blocking(move || {
            AiModelService::download_ai_model_from_huggingface(
                worker_app_handle,
                &worker_repo_id,
                worker_model_name.as_deref(),
            )
        })
        .await
        .map_err(|error| format!("Download task failed: {error}"))
        .and_then(|result| result);

        if result.is_ok() {
            let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
            let ai_model_service = AiModelService::new(db_manager.get_connection().clone());
            result = ai_model_service
                .sync_ai_models_from_cache()
                .await
                .map(|_| ())
                .map_err(|error| error.to_string());
        }

        AiModelService::finish_model_download(&app_handle, &result);
    });

    Ok("Model download started".to_string())
}

#[tauri::command]
pub fn get_ai_model_download_status() -> AiModelDownloadStatus {
    AiModelService::model_download_status()
}

#[tauri::command]
pub fn cancel_ai_model_download() -> Result<(), String> {
    AiModelService::cancel_model_download()
}
