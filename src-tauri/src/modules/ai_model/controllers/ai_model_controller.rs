use crate::modules::ai_model::services::ai_model_service::{AiModelFilters, AiModelService};
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use crate::modules::ai_model::models::ai_model::AiModel;
use tauri::{AppHandle, Manager};

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
