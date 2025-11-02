use crate::modules::ai::services::dataset::v3::dataset_metadata_service::DatasetMetadataService;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::DatasetMetadata;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::EpisodeMetadata;
use std::path::Path;
use tauri::command;

#[command]
pub fn get_dataset_metadata(nickname: String, dataset: String) -> Result<DatasetMetadata, String> {
    DatasetMetadataService::get_dataset_metadata(&nickname, &dataset)
}

#[command]
pub fn get_episode_metadata(
    nickname: String,
    dataset: String,
    episode_index: usize,
) -> Result<EpisodeMetadata, String> {
    DatasetMetadataService::get_episode_metadata(&nickname, &dataset, episode_index)
}
