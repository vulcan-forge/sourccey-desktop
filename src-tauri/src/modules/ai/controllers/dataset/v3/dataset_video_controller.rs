use crate::modules::ai::services::dataset::v3::dataset_video_service::DatasetVideoService;
use crate::modules::ai::types::dataset::v3::dataset_video_types::{VideoData, VideoEpisode};
use std::path::PathBuf;
use tauri::command;

#[command]
pub fn get_dataset_video_data(nickname: String, dataset: String) -> Result<VideoData, String> {
    DatasetVideoService::get_dataset_video_data(&nickname, &dataset)
}

#[command]
pub async fn get_episode_video(
    nickname: String,
    dataset: String,
    episode_id: usize,
    camera_id: usize,
) -> Result<VideoEpisode, String> {
    println!("Getting episode video for episode_id: {:?}", episode_id);
    DatasetVideoService::get_episode_video(&nickname, &dataset, episode_id, camera_id).await
}
