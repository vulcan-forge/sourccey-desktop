use crate::modules::ai::services::dataset::v3::dataset_service::DatasetService;
use crate::modules::ai::types::dataset::v3::dataset_types::Dataset;
use crate::services::directory::directory_service::DirectoryService;
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use sea_orm::DatabaseConnection;
use crate::database::connection::DatabaseManager;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri::command;

//--------------------------------------------
// Get Dataset Functions
//--------------------------------------------
#[command]
pub fn get_all_datasets(
    pagination: Option<PaginationParameters>,
) -> Result<PaginatedResponse<Dataset>, String> {
    DatasetService::get_all_datasets(pagination)
}

#[command]
pub fn get_datasets(
    nickname: String, // robot nickname
    pagination: Option<PaginationParameters>,
) -> Result<PaginatedResponse<Dataset>, String> {
    DatasetService::get_datasets(&nickname, pagination)
}

#[command]
pub fn get_dataset(nickname: String, dataset: String) -> Result<Option<Dataset>, String> {
    DatasetService::get_dataset(&nickname, &dataset)
}

//--------------------------------------------
// Count Dataset Functions
//--------------------------------------------
#[command]
pub fn count_all_datasets() -> Result<usize, String> {
    let cache_path = DirectoryService::get_lerobot_cache_dir()?;
    DatasetService::count_all_datasets(&cache_path)
}

#[command]
pub fn count_datasets(nickname: String) -> Result<usize, String> {
    let repository_path = DirectoryService::get_lerobot_repository_path(&nickname)?;
    DatasetService::count_datasets(&repository_path)
}

//--------------------------------------------
// Dataset CRUD Functions
//--------------------------------------------
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DatasetPath {
    pub nickname: String,
    pub dataset: String,
}

#[command]
pub async fn combine_datasets(app_handle: AppHandle, datasets: Vec<DatasetPath>, output_dataset: DatasetPath) -> Result<String, String> {
    let db_manager = app_handle.state::<DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    DatasetService::combine_datasets(app_handle, db_connection, datasets, output_dataset).await
}
