use serde::{Deserialize, Serialize};
use serde_json;
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DatasetParquet {
    pub dataset_name: String,
    pub total_episodes: usize,
    pub total_rows: usize,
    pub total_size: usize,
    pub chunks: Vec<String>,
    pub episodes: Vec<EpisodeParquet>,
    pub column_schema: Vec<ColumnData>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EpisodeParquet {
    pub parquet: Vec<HashMap<String, serde_json::Value>>,
    pub chunk_id: usize,
    pub file_id: usize,
    pub episode_id: usize,
    pub total_frames: Option<usize>,
    pub start_frame: Option<usize>,
    pub end_frame: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnData {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
}
