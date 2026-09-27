use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fmt;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const SYNC_PROTOCOL_VERSION: u32 = 1;
pub const MAX_COMPLETION_EVENT_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatasetSharingLevel {
    All,
    Metadata,
    Nothing,
}

impl DatasetSharingLevel {
    pub fn allows_metadata(self) -> bool {
        matches!(self, Self::All | Self::Metadata)
    }

    pub fn allows_full_dataset(self) -> bool {
        matches!(self, Self::All)
    }

    /// Policy can become more restrictive after capture, but never more permissive.
    pub fn intersect(self, current: Self) -> Self {
        match (self, current) {
            (Self::All, Self::All) => Self::All,
            (Self::All | Self::Metadata, Self::All | Self::Metadata) => Self::Metadata,
            _ => Self::Nothing,
        }
    }
}

impl fmt::Display for DatasetSharingLevel {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::All => "all",
            Self::Metadata => "metadata",
            Self::Nothing => "nothing",
        })
    }
}

impl std::str::FromStr for DatasetSharingLevel {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "all" => Ok(Self::All),
            "metadata" => Ok(Self::Metadata),
            "nothing" | "none" => Ok(Self::Nothing),
            _ => Err("sharing level must be one of: all, metadata, nothing".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetCompletedEvent {
    pub protocol_version: u32,
    pub event_id: Uuid,
    pub dataset_record_id: Uuid,
    pub robot_id: String,
    pub repo_id: String,
    pub local_path: PathBuf,
    pub completed_at: DateTime<Utc>,
    pub sharing_level_at_completion: DatasetSharingLevel,
    pub privacy_notice_version: u32,
    pub metadata: Value,
    pub metadata_sha256: String,
}

impl DatasetCompletedEvent {
    pub fn new(
        robot_id: impl Into<String>,
        repo_id: impl Into<String>,
        local_path: PathBuf,
        sharing_level_at_completion: DatasetSharingLevel,
        privacy_notice_version: u32,
        metadata: Value,
    ) -> Result<Self, String> {
        let metadata_sha256 = sha256_json(&metadata)?;
        let event = Self {
            protocol_version: SYNC_PROTOCOL_VERSION,
            event_id: Uuid::now_v7(),
            dataset_record_id: Uuid::now_v7(),
            robot_id: robot_id.into(),
            repo_id: repo_id.into(),
            local_path,
            completed_at: Utc::now(),
            sharing_level_at_completion,
            privacy_notice_version,
            metadata,
            metadata_sha256,
        };
        event.validate()?;
        Ok(event)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.protocol_version != SYNC_PROTOCOL_VERSION {
            return Err(format!(
                "unsupported sync protocol version {}; expected {}",
                self.protocol_version, SYNC_PROTOCOL_VERSION
            ));
        }
        if self.robot_id.trim().is_empty() {
            return Err("robotId cannot be empty".to_string());
        }
        if self.repo_id.trim().is_empty() {
            return Err("repoId cannot be empty".to_string());
        }
        if self.local_path.as_os_str().is_empty() {
            return Err("localPath cannot be empty".to_string());
        }
        let actual_hash = sha256_json(&self.metadata)?;
        if actual_hash != self.metadata_sha256 {
            return Err("metadataSha256 does not match the metadata payload".to_string());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum SyncRequest {
    Ping,
    GetStatus,
    SetSharingLevel { level: DatasetSharingLevel },
    NotifyInbox,
    PrepareForUpdate,
    Shutdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum SyncResponse {
    Pong { protocol_version: u32 },
    Accepted,
    Error { message: String },
}

#[derive(Debug, Clone)]
pub struct SyncInbox {
    root: PathBuf,
}

impl SyncInbox {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn pending_dir(&self) -> PathBuf {
        self.root.join("pending")
    }

    pub fn processed_dir(&self) -> PathBuf {
        self.root.join("processed")
    }

    pub fn failed_dir(&self) -> PathBuf {
        self.root.join("failed")
    }

    pub fn ensure_directories(&self) -> std::io::Result<()> {
        fs::create_dir_all(self.pending_dir().join(".tmp"))?;
        fs::create_dir_all(self.processed_dir())?;
        fs::create_dir_all(self.failed_dir())?;
        Ok(())
    }

    /// Writes to a temporary file, flushes it, then atomically publishes the event.
    pub fn submit(&self, event: &DatasetCompletedEvent) -> Result<PathBuf, String> {
        event.validate()?;
        self.ensure_directories()
            .map_err(|error| format!("failed to prepare sync inbox: {error}"))?;

        let bytes = serde_json::to_vec(event)
            .map_err(|error| format!("failed to serialize completion event: {error}"))?;
        if bytes.len() > MAX_COMPLETION_EVENT_BYTES {
            return Err(format!(
                "completion event exceeds the {} byte limit",
                MAX_COMPLETION_EVENT_BYTES
            ));
        }

        let filename = format!("{}.json", event.event_id);
        let temporary_path = self.pending_dir().join(".tmp").join(&filename);
        let published_path = self.pending_dir().join(filename);
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary_path)
            .map_err(|error| format!("failed to create completion event: {error}"))?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("failed to persist completion event: {error}"))?;
        drop(file);
        fs::rename(&temporary_path, &published_path)
            .map_err(|error| format!("failed to publish completion event: {error}"))?;
        Ok(published_path)
    }
}

pub fn read_completion_event(path: &Path) -> Result<(DatasetCompletedEvent, String), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("failed to inspect completion event: {error}"))?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() > MAX_COMPLETION_EVENT_BYTES as u64
    {
        return Err("completion event is not a valid regular file".to_string());
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read completion event: {error}"))?;
    let event: DatasetCompletedEvent = serde_json::from_str(&raw)
        .map_err(|error| format!("completion event contains invalid JSON: {error}"))?;
    event.validate()?;
    Ok((event, raw))
}

pub fn sha256_json(value: &Value) -> Result<String, String> {
    let bytes = serde_json::to_vec(value)
        .map_err(|error| format!("failed to serialize metadata for hashing: {error}"))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sharing_can_only_become_more_restrictive() {
        assert_eq!(
            DatasetSharingLevel::Metadata.intersect(DatasetSharingLevel::All),
            DatasetSharingLevel::Metadata
        );
        assert_eq!(
            DatasetSharingLevel::All.intersect(DatasetSharingLevel::Nothing),
            DatasetSharingLevel::Nothing
        );
    }

    #[test]
    fn validates_metadata_hash() {
        let event = DatasetCompletedEvent::new(
            "robot-1",
            "local/demo",
            PathBuf::from("dataset"),
            DatasetSharingLevel::Metadata,
            1,
            json!({"totalEpisodes": 3}),
        )
        .unwrap();
        assert!(event.validate().is_ok());
    }
}
