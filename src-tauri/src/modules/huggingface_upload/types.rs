use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadDataset {
    pub name: String,
    pub path: String,
    pub info_path: String,
    pub codebase_version: String,
    pub total_episodes: u64,
    pub total_frames: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedDataset {
    pub name: String,
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryReport {
    pub protocol_version: u32,
    pub root: String,
    pub datasets: Vec<UploadDataset>,
    pub skipped: Vec<SkippedDataset>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadJob {
    pub id: String,
    pub source_path: String,
    pub repo_id: String,
    pub revision: String,
    pub state: String,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub attempt_count: u64,
    pub next_attempt_at: Option<f64>,
    pub files_total: Option<u64>,
    pub bytes_total: Option<u64>,
    pub remote_url: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobsReport {
    pub protocol_version: u32,
    pub jobs: Vec<UploadJob>,
}
