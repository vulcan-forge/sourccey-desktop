use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoData {
    pub dataset_name: String,
    pub total_videos: usize,
    pub cameras: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoEpisode {
    pub video: Vec<u8>,
    pub chunk_id: usize,   // 0, 1, 2, etc.
    pub file_id: usize,    // 0, 1, 2, etc.
    pub episode_id: usize, // 0, 1, 2, etc.
    pub camera_name: String,
    pub total_duration: Option<f64>, // in seconds
    pub total_frames: Option<usize>,
    pub start_frame: Option<usize>,
    pub end_frame: Option<usize>,
}
