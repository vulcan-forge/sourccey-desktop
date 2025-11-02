use crate::modules::ai::services::dataset::v3::dataset_parquet_service::DatasetParquetService;
use crate::modules::ai::types::dataset::v3::dataset_parquet_types::{
    DatasetParquet, EpisodeParquet,
};
use std::path::PathBuf;
use tauri::command;

#[command]
pub fn get_dataset_parquet_data(
    nickname: String,
    dataset: String,
) -> Result<DatasetParquet, String> {
    DatasetParquetService::get_dataset_parquet_data(&nickname, &dataset)
}

#[command]
pub fn get_episode_parquet(
    nickname: String,
    dataset: String,
    episode_id: usize,
) -> Result<EpisodeParquet, String> {
    DatasetParquetService::get_episode_parquet(&nickname, &dataset, episode_id)
}
