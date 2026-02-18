use crate::modules::ai::services::ai_models::ai_model_service::AIModelService;
use crate::modules::ai::types::ai_models::ai_model_types::{
    AIModel, HuggingFaceModelDeleteResult, HuggingFaceModelDownloadResponse,
    HuggingFaceModelDownloadResult,
    HuggingFaceOrganizationCatalog,
};
use crate::services::directory::directory_service::DirectoryService;
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use tauri::command;
use tauri::AppHandle;

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

#[command]
pub fn download_ai_model_from_huggingface(repo_input: String) -> Result<AIModel, String> {
    AIModelService::download_model_from_huggingface(&repo_input)
}

#[command]
pub fn get_huggingface_organization_models(
    organization: String,
) -> Result<HuggingFaceOrganizationCatalog, String> {
    AIModelService::get_huggingface_organization_catalog(&organization)
}

#[command]
pub fn download_huggingface_model_to_cache(
    repo_id: String,
) -> Result<HuggingFaceModelDownloadResult, String> {
    AIModelService::download_huggingface_model_to_cache(&repo_id)
}

#[command]
pub fn delete_huggingface_model_from_cache(
    repo_id: String,
) -> Result<HuggingFaceModelDeleteResult, String> {
    AIModelService::delete_huggingface_model_from_cache(&repo_id)
}

#[command]
pub fn download_huggingface_model_to_cache_with_progress(
    app_handle: AppHandle,
    repo_id: String,
    replace_existing: bool,
) -> Result<HuggingFaceModelDownloadResponse, String> {
    AIModelService::download_huggingface_model_to_cache_with_progress(
        &app_handle,
        &repo_id,
        replace_existing,
    )
}

#[command]
pub fn start_huggingface_model_download(
    app_handle: AppHandle,
    repo_id: String,
    replace_existing: bool,
) -> Result<String, String> {
    AIModelService::start_huggingface_model_download(&app_handle, &repo_id, replace_existing)?;
    Ok("started".to_string())
}
