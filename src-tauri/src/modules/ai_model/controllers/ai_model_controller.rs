use crate::modules::ai_model::models::ai_model::AiModel;
use crate::modules::ai_model::services::ai_model_service::{
    AiModelFilters, AiModelService, AiModelSyncResult,
};
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
pub async fn sync_ai_models_from_cache(
    app_handle: AppHandle,
) -> Result<AiModelSyncResult, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let ai_model_service = AiModelService::new(db_manager.get_connection().clone());

    let result = ai_model_service
        .sync_ai_models_from_cache()
        .await
        .map_err(|e| e.to_string())?;

    Ok(result)
}
