use crate::modules::ai::services::dataset::v3::dataset_metadata_service::DatasetMetadataService;
use crate::modules::ai::services::dataset::v3::dataset_parquet_service::DatasetParquetService;
use crate::modules::ai::types::dataset::v3::dataset_video_types::{VideoData, VideoEpisode};
use crate::services::directory::directory_service::DirectoryService;
use chrono;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

pub struct DatasetVideoService;

impl DatasetVideoService {
    //----------------------------------------------------------
    // Public Get Dataset Video Data Functions
    //----------------------------------------------------------

    /// Get the video data for a dataset
    pub fn get_dataset_video_data(
        nickname: &String,
        dataset: &String,
    ) -> Result<VideoData, String> {
        let dataset_path = DirectoryService::get_lerobot_dataset_path(nickname, dataset)?;
        let mut video_data = VideoData {
            dataset_name: dataset_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string(),
            total_videos: 0,
            cameras: Vec::new(),
        };

        let videos_path = dataset_path.join("videos");
        if !videos_path.exists() || !videos_path.is_dir() {
            return Ok(video_data);
        }

        let dataset_metadata = DatasetMetadataService::get_dataset_metadata(nickname, dataset)?;

        // Find all camera directories first to get camera list
        let camera_set = std::collections::HashSet::new();
        let camera_entries: Vec<_> = fs::read_dir(&videos_path)
            .map_err(|e| format!("Failed to read videos directory {:?}: {}", videos_path, e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to read directory entry: {}", e))?;

        let total_videos = camera_entries.len() * dataset_metadata.total_episodes as usize;
        video_data.total_videos = total_videos;
        video_data.cameras = camera_set.into_iter().collect();
        Ok(video_data)
    }

    pub async fn get_episode_video(
        nickname: &String,
        dataset: &String,
        episode_id: usize,
        camera_id: usize,
    ) -> Result<VideoEpisode, String> {

        // Step 1: Get dataset path
        let dataset_path = DirectoryService::get_lerobot_dataset_path(nickname, dataset)?;

        // Step 2: Get dataset metadata
        let dataset_metadata = DatasetMetadataService::get_dataset_metadata(nickname, dataset)?;
        let fps = dataset_metadata.fps;

        // Step 3: Get episode location
        let (chunk_name, file_name, row_idx) =
            DatasetMetadataService::get_episode_location(nickname, dataset, episode_id)?;

        // Step 4: Get episode metadata
        let episode_metadata = DatasetMetadataService::get_episode_metadata_from_data(
            nickname,
            dataset,
            &chunk_name,
            &file_name,
            row_idx,
        )?;

        // Step 5: Build file path
        let camera_name = episode_metadata.cameras[camera_id].camera_name.clone();
        let file_path = dataset_path
            .join("videos")
            .join(camera_name.clone())
            .join(chunk_name.clone())
            .join(format!("{}.mp4", file_name));

        // Step 6: Extract video segment (MAJOR BOTTLENECK)
        let start_frame = episode_metadata.dataset_from_index;
        let end_frame = episode_metadata.dataset_to_index;

        // Wrap the bottleneck in tokio::task::spawn_blocking
        let video_segment = tokio::task::spawn_blocking(move || {
            Self::extract_video_segment(&file_path, start_frame, end_frame)
        })
        .await
        .map_err(|e| format!("Video extraction task failed: {}", e))??;

        // Step 7: Calculate metadata
        let total_duration = (end_frame - start_frame) as f64 / fps as f64;
        let chunk_id = DatasetMetadataService::get_chunk_id_from_chunk_name(&chunk_name)?;
        let file_id = DatasetMetadataService::get_file_id_from_file_name(&file_name)?;

        let video_episode = VideoEpisode {
            video: video_segment,
            chunk_id,
            file_id,
            episode_id,
            camera_name: camera_name.clone(),
            total_duration: Some(total_duration),
            start_frame: Some(start_frame),
            end_frame: Some(end_frame),
            total_frames: Some(end_frame - start_frame),
        };

        Ok(video_episode)
    }

    /// Calculate the total size of all video files across all chunks and cameras
    pub fn calculate_video_size(dataset_path: &Path) -> Result<usize, String> {
        let mut total_size = 0usize;

        let videos_path = dataset_path.join("videos");
        if !videos_path.exists() || !videos_path.is_dir() {
            return Ok(total_size);
        }

        // Walk through all camera/observation directories
        let camera_entries = fs::read_dir(&videos_path)
            .map_err(|e| format!("Failed to read videos directory {:?}: {}", videos_path, e))?;

        for camera_entry in camera_entries {
            let camera_entry =
                camera_entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let camera_path = camera_entry.path();

            if camera_path.is_dir() {
                // This is a camera/observation directory (e.g., "observation.images.main")
                let chunk_entries = fs::read_dir(&camera_path).map_err(|e| {
                    format!("Failed to read camera directory {:?}: {}", camera_path, e)
                })?;

                for chunk_entry in chunk_entries {
                    let chunk_entry =
                        chunk_entry.map_err(|e| format!("Failed to read chunk entry: {}", e))?;
                    let chunk_path = chunk_entry.path();

                    if chunk_path.is_dir() {
                        // This is a chunk directory (e.g., "chunk-000")
                        let video_entries = fs::read_dir(&chunk_path).map_err(|e| {
                            format!("Failed to read chunk directory {:?}: {}", chunk_path, e)
                        })?;

                        for video_entry in video_entries {
                            let video_entry = video_entry
                                .map_err(|e| format!("Failed to read video entry: {}", e))?;
                            let video_file = video_entry.path();

                            // Only process MP4 files
                            if video_file.is_file()
                                && video_file.extension().and_then(|s| s.to_str()) == Some("mp4")
                            {
                                let metadata = fs::metadata(&video_file).map_err(|e| {
                                    format!("Failed to get metadata for {:?}: {}", video_file, e)
                                })?;
                                total_size += metadata.len() as usize;
                            }
                        }
                    }
                }
            }
        }

        Ok(total_size)
    }

    //----------------------------------------------------------
    // Private Helper Functions
    //----------------------------------------------------------

    // Extract the video segment - MAXIMUM SPEED (milliseconds)
    fn extract_video_segment(
        file_path: &Path,
        start_frame: usize,
        end_frame: usize,
    ) -> Result<Vec<u8>, String> {
        use std::process::{Command, Stdio};
        use std::time::Instant;

        let ffmpeg_path = DirectoryService::get_ffmpeg_path()?;

        // Calculate time-based cuts (assuming 30fps)
        let fps = 30.0;
        let start_time = start_frame as f64 / fps;
        let duration = (end_frame - start_frame) as f64 / fps;

        // MAXIMUM SPEED: Ultra-fast time-based cutting with minimal processing
        let child = Command::new(ffmpeg_path)
            // Hardware acceleration
            .arg("-hwaccel")
            .arg("auto")
            .arg("-hwaccel_device")
            .arg("0")
            // Input file
            .arg("-i")
            .arg(file_path)
            // Time-based cutting (fastest method)
            .arg("-ss")
            .arg(format!("{:.3}", start_time))
            .arg("-t")
            .arg(format!("{:.3}", duration))
            // MAXIMUM SPEED: Copy everything without re-encoding
            .arg("-c")
            .arg("copy") // Copy ALL streams (video + audio)
            // Skip processing optimizations
            .arg("-avoid_negative_ts")
            .arg("make_zero")
            .arg("-fflags")
            .arg("+genpts") // Generate presentation timestamps
            // Minimal output format
            .arg("-f")
            .arg("matroska") // Fastest container format
            .arg("-") // Stream to stdout
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn FFmpeg: {}", e))?;

        let output = child
            .wait_with_output()
            .map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("FFmpeg failed: {}", stderr));
        }

        Ok(output.stdout)
    }
}
