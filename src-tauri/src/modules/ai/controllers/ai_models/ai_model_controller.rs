use crate::modules::ai::services::ai_models::ai_model_service::AIModelService;
use crate::modules::ai::types::ai_models::ai_model_types::AIModel;
use crate::services::directory::directory_service::DirectoryService;
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use tauri::command;

#[command]
pub fn get_all_ai_models(
    pagination: Option<PaginationParameters>,
) -> Result<PaginatedResponse<AIModel>, String> {
    AIModelService::get_all_ai_models(pagination)
}

#[command]
pub fn get_ai_models(
    repo_id: String,
    pagination: Option<PaginationParameters>,
) -> Result<PaginatedResponse<AIModel>, String> {
    AIModelService::get_ai_models(&repo_id, pagination)
}

#[command]
pub fn get_ai_model(repo_id: String, name: String) -> Result<AIModel, String> {
    AIModelService::get_ai_model(&repo_id, &name)
}

#[command]
pub fn count_all_ai_models() -> Result<usize, String> {
    let ai_models_path = DirectoryService::get_lerobot_ai_models_path()?;
    AIModelService::count_all_ai_model_directories(&ai_models_path)
}

#[command]
pub fn count_ai_models(repo_id: String) -> Result<usize, String> {
    let repository_path = DirectoryService::get_lerobot_ai_model_repository_path(&repo_id)?;
    AIModelService::count_ai_model_directories(&repository_path)
}
