use serde::{Deserialize, Serialize};
use serde_json::Value;

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

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetSyncIdentity {
    pub installation_id: String,
    pub customer_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueDatasetMetadataRequest {
    pub robot_id: String,
    pub dataset_id: String,
    pub metadata: Value,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedDatasetMetadata {
    pub id: String,
    pub object_key: String,
    pub payload_sha256: String,
    pub state: String,
    pub duplicate: bool,
}
