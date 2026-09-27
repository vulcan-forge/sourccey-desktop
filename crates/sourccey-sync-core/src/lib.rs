use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fmt;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const SYNC_PROTOCOL_VERSION: u32 = 3;
pub const MAX_COMPLETION_EVENT_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatasetSharingLevel {
    All,
    Metadata,
    Nothing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminDatasetPolicy {
    pub policy_id: String,
    pub version: u64,
    pub level: DatasetSharingLevel,
    pub applies_to_existing: bool,
    pub issued_at: DateTime<Utc>,
}

impl AdminDatasetPolicy {
    pub fn validate(&self) -> Result<(), String> {
        if self.policy_id.trim().is_empty() || self.policy_id.len() > 128 {
            return Err("admin policy ID must contain between 1 and 128 characters".to_string());
        }
        if self.version > i64::MAX as u64 {
            return Err("admin policy version is too large".to_string());
        }
        Ok(())
    }
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
    pub dataset_revision_id: Uuid,
    pub robot_id: String,
    pub repo_id: String,
    pub dataset_name: String,
    pub completed_at: DateTime<Utc>,
    pub user_sharing_enabled_at_completion: bool,
    pub privacy_notice_version: u32,
    pub metadata: Value,
    pub metadata_sha256: String,
}

impl DatasetCompletedEvent {
    pub fn new(
        robot_id: impl Into<String>,
        dataset_name: impl Into<String>,
        user_sharing_enabled_at_completion: bool,
        privacy_notice_version: u32,
        metadata: Value,
    ) -> Result<Self, String> {
        let dataset_name = dataset_name.into();
        validate_dataset_name(&dataset_name)?;
        let metadata_sha256 = sha256_json(&metadata)?;
        let event = Self {
            protocol_version: SYNC_PROTOCOL_VERSION,
            event_id: Uuid::now_v7(),
            dataset_revision_id: Uuid::now_v7(),
            robot_id: robot_id.into(),
            repo_id: repo_id_for_dataset(&dataset_name),
            dataset_name,
            completed_at: Utc::now(),
            user_sharing_enabled_at_completion,
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
        validate_dataset_name(&self.dataset_name)?;
        if self.repo_id != repo_id_for_dataset(&self.dataset_name) {
            return Err("repoId must identify a direct child of vulcan-studio".to_string());
        }
        let actual_hash = sha256_json(&self.metadata)?;
        if actual_hash != self.metadata_sha256 {
            return Err("metadataSha256 does not match the metadata payload".to_string());
        }
        Ok(())
    }
}

pub fn validate_dataset_name(value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if value != trimmed || value.is_empty() || value.len() > 128 {
        return Err("dataset name must contain between 1 and 128 characters".to_string());
    }
    if matches!(value, "." | "..")
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(
            "dataset name may only contain letters, numbers, dots, hyphens, and underscores"
                .to_string(),
        );
    }
    Ok(())
}

pub fn repo_id_for_dataset(dataset_name: &str) -> String {
    format!("vulcan-studio/{dataset_name}")
}

pub fn validate_installation_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(
            "installation ID must contain 1-128 letters, numbers, hyphens, or underscores"
                .to_string(),
        );
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncCloudContext {
    pub installation_id: String,
    pub account_id: Option<String>,
    pub diagnostics_enabled: bool,
    pub user_data_sharing_enabled: bool,
    pub privacy_notice_version: u32,
    pub consent_updated_at: DateTime<Utc>,
    pub api_base_url: String,
}

impl SyncCloudContext {
    pub fn validate(&self) -> Result<(), String> {
        validate_installation_id(&self.installation_id)?;
        if self
            .account_id
            .as_deref()
            .is_some_and(|value| value.trim().is_empty() || value.len() > 128)
        {
            return Err("account ID must contain between 1 and 128 characters".to_string());
        }
        let api_base = self.api_base_url.trim();
        if api_base.is_empty()
            || api_base.len() > 2048
            || !(api_base.starts_with("https://") || api_base.starts_with("http://"))
        {
            return Err("API base URL must be an HTTP or HTTPS URL".to_string());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum SyncRequest {
    Ping,
    GetStatus,
    AdoptInstallationId { installation_id: String },
    ConfigureCloud { context: SyncCloudContext },
    SetUserSharingEnabled { enabled: bool },
    SetDatasetRoot { path: PathBuf },
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncControlCommand {
    pub protocol_version: u32,
    pub command_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub request: SyncRequest,
}

#[derive(Debug, Clone)]
pub struct SyncControlInbox {
    root: PathBuf,
}

impl SyncControlInbox {
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
        ensure_inbox_directories(self)
    }

    pub fn submit(&self, request: SyncRequest) -> Result<PathBuf, String> {
        let command = SyncControlCommand {
            protocol_version: SYNC_PROTOCOL_VERSION,
            command_id: Uuid::now_v7(),
            created_at: Utc::now(),
            request,
        };
        submit_json(self, command.command_id, &command, "sync control command")
    }
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
        ensure_inbox_directories(self)
    }

    /// Writes to a temporary file, flushes it, then atomically publishes the event.
    pub fn submit(&self, event: &DatasetCompletedEvent) -> Result<PathBuf, String> {
        event.validate()?;
        self.ensure_directories()
            .map_err(|error| format!("failed to prepare sync inbox: {error}"))?;

        submit_json(self, event.event_id, event, "completion event")
    }
}

pub fn read_control_command(path: &Path) -> Result<SyncControlCommand, String> {
    let raw = read_regular_json_file(path, "sync control command")?;
    let command: SyncControlCommand = serde_json::from_str(&raw)
        .map_err(|error| format!("sync control command contains invalid JSON: {error}"))?;
    if command.protocol_version != SYNC_PROTOCOL_VERSION {
        return Err(format!(
            "unsupported sync protocol version {}; expected {}",
            command.protocol_version, SYNC_PROTOCOL_VERSION
        ));
    }
    Ok(command)
}

pub fn read_completion_event(path: &Path) -> Result<(DatasetCompletedEvent, String), String> {
    let raw = read_regular_json_file(path, "completion event")?;
    let event: DatasetCompletedEvent = serde_json::from_str(&raw)
        .map_err(|error| format!("completion event contains invalid JSON: {error}"))?;
    event.validate()?;
    Ok((event, raw))
}

trait InboxDirectories {
    fn pending_dir(&self) -> PathBuf;
    fn processed_dir(&self) -> PathBuf;
    fn failed_dir(&self) -> PathBuf;
}

impl InboxDirectories for SyncInbox {
    fn pending_dir(&self) -> PathBuf {
        self.pending_dir()
    }

    fn processed_dir(&self) -> PathBuf {
        self.processed_dir()
    }

    fn failed_dir(&self) -> PathBuf {
        self.failed_dir()
    }
}

impl InboxDirectories for SyncControlInbox {
    fn pending_dir(&self) -> PathBuf {
        self.pending_dir()
    }

    fn processed_dir(&self) -> PathBuf {
        self.processed_dir()
    }

    fn failed_dir(&self) -> PathBuf {
        self.failed_dir()
    }
}

fn ensure_inbox_directories(inbox: &impl InboxDirectories) -> std::io::Result<()> {
    fs::create_dir_all(inbox.pending_dir().join(".tmp"))?;
    fs::create_dir_all(inbox.processed_dir())?;
    fs::create_dir_all(inbox.failed_dir())?;
    Ok(())
}

fn submit_json(
    inbox: &impl InboxDirectories,
    id: Uuid,
    value: &impl Serialize,
    description: &str,
) -> Result<PathBuf, String> {
    ensure_inbox_directories(inbox)
        .map_err(|error| format!("failed to prepare {description} inbox: {error}"))?;
    let bytes = serde_json::to_vec(value)
        .map_err(|error| format!("failed to serialize {description}: {error}"))?;
    if bytes.len() > MAX_COMPLETION_EVENT_BYTES {
        return Err(format!(
            "{description} exceeds the {} byte limit",
            MAX_COMPLETION_EVENT_BYTES
        ));
    }
    let filename = format!("{id}.json");
    let temporary_path = inbox.pending_dir().join(".tmp").join(&filename);
    let published_path = inbox.pending_dir().join(filename);
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary_path)
        .map_err(|error| format!("failed to create {description}: {error}"))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("failed to persist {description}: {error}"))?;
    drop(file);
    fs::rename(&temporary_path, &published_path)
        .map_err(|error| format!("failed to publish {description}: {error}"))?;
    Ok(published_path)
}

fn read_regular_json_file(path: &Path, description: &str) -> Result<String, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("failed to inspect {description}: {error}"))?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() > MAX_COMPLETION_EVENT_BYTES as u64
    {
        return Err(format!("{description} is not a valid regular file"));
    }
    fs::read_to_string(path).map_err(|error| format!("failed to read {description}: {error}"))
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
        let event =
            DatasetCompletedEvent::new("robot-1", "demo", true, 1, json!({"totalEpisodes": 3}))
                .unwrap();
        assert!(event.validate().is_ok());
    }
}
