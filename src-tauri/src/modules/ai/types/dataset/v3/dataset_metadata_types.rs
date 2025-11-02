use serde::{Deserialize, Serialize};
use std::collections::HashMap;

//--------------------------------------------------
// Dataset Info (info.json)
//--------------------------------------------------
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DatasetMetadata {
    pub codebase_version: String,
    pub robot_type: String,
    pub total_episodes: u32,
    pub total_frames: u32,
    pub total_tasks: u32,
    pub chunks_size: u32,
    pub data_files_size_in_mb: u32,
    pub video_files_size_in_mb: u32,
    pub fps: u32,
    pub splits: HashMap<String, String>,
    pub data_path: String,
    pub video_path: String,
    pub features: HashMap<String, FeatureMetadata>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeatureMetadata {
    pub dtype: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub names: Option<Vec<String>>,
    pub shape: Vec<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub info: Option<HashMap<String, serde_json::Value>>,
}

// Individual episode metadata
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EpisodeMetadata {
    pub episode_index: usize,
    pub tasks: Vec<String>,
    pub length: usize,
    pub data_chunk_index: usize,
    pub data_file_index: usize,
    pub dataset_from_index: usize,
    pub dataset_to_index: usize,
    pub cameras: Vec<CameraMetadata>,
    pub action_stats: Option<ActionStats>,
    pub observation_state_stats: Option<ObservationStateStats>,
    pub camera_stats: HashMap<String, CameraStats>, // camera_name -> stats
    pub timestamp_stats: Option<TimestampStats>,
    pub frame_index_stats: Option<FrameIndexStats>,
    pub episode_index_stats: Option<EpisodeIndexStats>,
    pub index_stats: Option<IndexStats>,
    pub task_index_stats: Option<TaskIndexStats>,
    pub meta_episodes_chunk_index: Option<usize>,
    pub meta_episodes_file_index: Option<usize>,
    pub file_size: usize,
    pub created_at: String,
}

// Camera metadata for each episode
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CameraMetadata {
    pub camera_name: String,
    pub chunk_index: usize,
    pub file_index: usize,
    pub from_timestamp: Option<f64>,
    pub to_timestamp: Option<f64>,
}

// Generic stats structure for all statistical data
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Stats {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub std: Option<f64>,
    pub count: Option<f64>,
}

// Specific stats types for different data categories

// Action statistics: "stats/action/min", "stats/action/max", etc.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActionStats {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub std: Option<f64>,
    pub count: Option<f64>,
}

// Observation state statistics: "stats/observation.state/min", etc.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ObservationStateStats {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub std: Option<f64>,
    pub count: Option<f64>,
}

// Camera statistics: "stats/observation.images.main/max", etc.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CameraStats {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub std: Option<f64>,
    pub count: Option<f64>,
}

// Timestamp statistics: "stats/timestamp/mean", etc.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimestampStats {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub std: Option<f64>,
    pub count: Option<f64>,
}

// Frame index statistics: "stats/frame_index/max", etc.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FrameIndexStats {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub std: Option<f64>,
    pub count: Option<f64>,
}

// Episode index statistics: "stats/episode_index/mean", etc.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EpisodeIndexStats {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub std: Option<f64>,
    pub count: Option<f64>,
}

// Index statistics: "stats/index/std", etc.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexStats {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub std: Option<f64>,
    pub count: Option<f64>,
}

// Task index statistics: "stats/task_index/min", etc.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskIndexStats {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub std: Option<f64>,
    pub count: Option<f64>,
}

// Helper trait for converting between different stats types
pub trait StatsExtractor {
    #[allow(dead_code)]
    fn from_stats(stats: Stats) -> Self;

    #[allow(dead_code)]
    fn to_stats(&self) -> Stats;
}

// Implement the trait for all stats types
impl StatsExtractor for ActionStats {
    fn from_stats(stats: Stats) -> Self {
        ActionStats {
            min: stats.min,
            max: stats.max,
            mean: stats.mean,
            std: stats.std,
            count: stats.count,
        }
    }

    fn to_stats(&self) -> Stats {
        Stats {
            min: self.min,
            max: self.max,
            mean: self.mean,
            std: self.std,
            count: self.count,
        }
    }
}

impl StatsExtractor for ObservationStateStats {
    fn from_stats(stats: Stats) -> Self {
        ObservationStateStats {
            min: stats.min,
            max: stats.max,
            mean: stats.mean,
            std: stats.std,
            count: stats.count,
        }
    }

    fn to_stats(&self) -> Stats {
        Stats {
            min: self.min,
            max: self.max,
            mean: self.mean,
            std: self.std,
            count: self.count,
        }
    }
}

impl StatsExtractor for CameraStats {
    fn from_stats(stats: Stats) -> Self {
        CameraStats {
            min: stats.min,
            max: stats.max,
            mean: stats.mean,
            std: stats.std,
            count: stats.count,
        }
    }

    fn to_stats(&self) -> Stats {
        Stats {
            min: self.min,
            max: self.max,
            mean: self.mean,
            std: self.std,
            count: self.count,
        }
    }
}

impl StatsExtractor for TimestampStats {
    fn from_stats(stats: Stats) -> Self {
        TimestampStats {
            min: stats.min,
            max: stats.max,
            mean: stats.mean,
            std: stats.std,
            count: stats.count,
        }
    }

    fn to_stats(&self) -> Stats {
        Stats {
            min: self.min,
            max: self.max,
            mean: self.mean,
            std: self.std,
            count: self.count,
        }
    }
}

impl StatsExtractor for FrameIndexStats {
    fn from_stats(stats: Stats) -> Self {
        FrameIndexStats {
            min: stats.min,
            max: stats.max,
            mean: stats.mean,
            std: stats.std,
            count: stats.count,
        }
    }

    fn to_stats(&self) -> Stats {
        Stats {
            min: self.min,
            max: self.max,
            mean: self.mean,
            std: self.std,
            count: self.count,
        }
    }
}

impl StatsExtractor for EpisodeIndexStats {
    fn from_stats(stats: Stats) -> Self {
        EpisodeIndexStats {
            min: stats.min,
            max: stats.max,
            mean: stats.mean,
            std: stats.std,
            count: stats.count,
        }
    }

    fn to_stats(&self) -> Stats {
        Stats {
            min: self.min,
            max: self.max,
            mean: self.mean,
            std: self.std,
            count: self.count,
        }
    }
}

impl StatsExtractor for IndexStats {
    fn from_stats(stats: Stats) -> Self {
        IndexStats {
            min: stats.min,
            max: stats.max,
            mean: stats.mean,
            std: stats.std,
            count: stats.count,
        }
    }

    fn to_stats(&self) -> Stats {
        Stats {
            min: self.min,
            max: self.max,
            mean: self.mean,
            std: self.std,
            count: self.count,
        }
    }
}

impl StatsExtractor for TaskIndexStats {
    fn from_stats(stats: Stats) -> Self {
        TaskIndexStats {
            min: stats.min,
            max: stats.max,
            mean: stats.mean,
            std: stats.std,
            count: stats.count,
        }
    }

    fn to_stats(&self) -> Stats {
        Stats {
            min: self.min,
            max: self.max,
            mean: self.mean,
            std: self.std,
            count: self.count,
        }
    }
}
