use crate::modules::dataset_sync::types::{
    DatasetSyncIdentity, DiscoveryReport, JobsReport, QueueDatasetMetadataRequest,
    QueuedDatasetMetadata,
};
use crate::services::directory::directory_service::DirectoryService;
use crate::utils::windows_process::configure_std_command;
use chrono::{DateTime, Utc};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, DbErr, Statement, TryGetable};
use serde::de::DeserializeOwned;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::ffi::OsString;
use std::path::Path;
use std::process::Command;
use uuid::Uuid;

const PROTOCOL_VERSION: u32 = 1;
const STDERR_LIMIT: usize = 4096;

pub struct UploadService;

impl UploadService {
    pub async fn get_identity(
        connection: &DatabaseConnection,
    ) -> Result<DatasetSyncIdentity, DbErr> {
        let row = connection
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT installation_id, customer_id, created_at \
                 FROM installation_identity WHERE singleton_key = 1",
            ))
            .await?
            .ok_or_else(|| DbErr::Custom("installation identity is missing".to_string()))?;

        let created_at: DateTime<Utc> = row.try_get("", "created_at")?;
        Ok(DatasetSyncIdentity {
            installation_id: row.try_get("", "installation_id")?,
            customer_id: row.try_get("", "customer_id")?,
            created_at: created_at.to_rfc3339(),
        })
    }

    pub async fn queue_metadata(
        connection: &DatabaseConnection,
        request: QueueDatasetMetadataRequest,
    ) -> Result<QueuedDatasetMetadata, String> {
        let identity = Self::get_identity(connection)
            .await
            .map_err(|error| format!("Failed to load installation identity: {error}"))?;
        let robot_segment = Self::object_key_segment(&request.robot_id, "robotId")?;
        let dataset_segment = Self::object_key_segment(&request.dataset_id, "datasetId")?;

        let payload = json!({
            "schemaVersion": 1,
            "installationId": identity.installation_id.clone(),
            "customerId": identity.customer_id.clone(),
            "robotId": request.robot_id.clone(),
            "datasetId": request.dataset_id.clone(),
            "metadata": request.metadata,
        });
        let payload_json = serde_json::to_string(&payload)
            .map_err(|error| format!("Failed to serialize dataset metadata: {error}"))?;
        let payload_sha256 = format!("{:x}", Sha256::digest(payload_json.as_bytes()));
        let object_key = format!(
            "{}/{}/{}/metadata/{}.json",
            identity.installation_id, robot_segment, dataset_segment, payload_sha256
        );
        let id = Uuid::now_v7().to_string();
        let now = Utc::now();

        let result = connection
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT OR IGNORE INTO dataset_metadata_upload \
                 (id, installation_id, customer_id, robot_id, dataset_id, object_key, \
                  payload_sha256, payload_json, state, attempt_count, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)",
                [
                    id.clone().into(),
                    identity.installation_id.clone().into(),
                    identity.customer_id.clone().into(),
                    request.robot_id.into(),
                    request.dataset_id.into(),
                    object_key.clone().into(),
                    payload_sha256.clone().into(),
                    payload_json.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await
            .map_err(|error| format!("Failed to queue dataset metadata: {error}"))?;

        if result.rows_affected() == 1 {
            return Ok(QueuedDatasetMetadata {
                id,
                object_key,
                payload_sha256,
                state: "queued".to_string(),
                duplicate: false,
            });
        }

        let row = connection
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, object_key, state FROM dataset_metadata_upload \
                 WHERE installation_id = ? AND robot_id = ? AND dataset_id = ? \
                 AND payload_sha256 = ?",
                [
                    identity.installation_id.into(),
                    payload["robotId"].as_str().unwrap_or_default().into(),
                    payload["datasetId"].as_str().unwrap_or_default().into(),
                    payload_sha256.clone().into(),
                ],
            ))
            .await
            .map_err(|error| format!("Failed to load queued dataset metadata: {error}"))?
            .ok_or_else(|| "Queued dataset metadata could not be found".to_string())?;

        Ok(QueuedDatasetMetadata {
            id: row.try_get("", "id").map_err(|error| error.to_string())?,
            object_key: row
                .try_get("", "object_key")
                .map_err(|error| error.to_string())?,
            payload_sha256,
            state: row
                .try_get("", "state")
                .map_err(|error| error.to_string())?,
            duplicate: true,
        })
    }

    fn object_key_segment(value: &str, field: &str) -> Result<String, String> {
        let value = value.trim();
        if value.is_empty() {
            return Err(format!("{field} cannot be empty"));
        }
        if value.len() > 256 {
            return Err(format!("{field} is too long"));
        }

        let mut encoded = String::with_capacity(value.len());
        for byte in value.bytes() {
            if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.') {
                encoded.push(char::from(byte));
            } else {
                encoded.push_str(&format!("~{byte:02X}"));
            }
        }
        if encoded == "." || encoded == ".." {
            return Err(format!("{field} cannot be a relative path segment"));
        }
        Ok(encoded)
    }

    pub fn discover_datasets() -> Result<DiscoveryReport, String> {
        let report: DiscoveryReport = Self::run(&[OsString::from("discover")])?;
        Self::require_protocol(report.protocol_version)?;
        Ok(report)
    }

    pub fn list_jobs(database_path: &Path) -> Result<JobsReport, String> {
        let report: JobsReport = Self::run(&[
            OsString::from("jobs"),
            OsString::from("--database"),
            database_path.as_os_str().to_owned(),
        ])?;
        Self::require_protocol(report.protocol_version)?;
        Ok(report)
    }

    fn run<T: DeserializeOwned>(arguments: &[OsString]) -> Result<T, String> {
        let module_dir = DirectoryService::get_dataset_sync_dir()?;
        let module_src = module_dir.join("src");
        if !module_src.join("vulcan_hf_upload").is_dir() {
            return Err(format!(
                "LeRobot Dataset Sync module is unavailable at {}",
                module_dir.display()
            ));
        }

        let python_path = DirectoryService::get_python_path()?;
        if !python_path.is_file() {
            return Err(format!(
                "Sourccey Python environment is unavailable at {}",
                python_path.display()
            ));
        }

        let mut command = Command::new(&python_path);
        command
            .arg("-m")
            .arg("vulcan_hf_upload")
            .args(arguments)
            .current_dir(&module_dir)
            .env("PYTHONPATH", module_src);
        configure_std_command(&mut command);

        let output = command
            .output()
            .map_err(|error| format!("Failed to start upload module: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let diagnostic: String = stderr.trim().chars().take(STDERR_LIMIT).collect();
            return Err(if diagnostic.is_empty() {
                format!("Upload module exited with status {}", output.status)
            } else {
                format!("Upload module failed: {diagnostic}")
            });
        }

        serde_json::from_slice(&output.stdout)
            .map_err(|error| format!("Upload module returned invalid JSON: {error}"))
    }

    fn require_protocol(actual: u32) -> Result<(), String> {
        if actual == PROTOCOL_VERSION {
            Ok(())
        } else {
            Err(format!(
                "Unsupported upload protocol version {actual}; expected {PROTOCOL_VERSION}"
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_discovery_protocol() {
        let report: DiscoveryReport = serde_json::from_str(
            r#"{"protocolVersion":1,"root":"/tmp/vulcan-studio","datasets":[],"skipped":[]}"#,
        )
        .unwrap();

        assert_eq!(report.protocol_version, 1);
        assert!(report.datasets.is_empty());
    }

    #[test]
    fn rejects_unknown_protocol_versions() {
        assert!(UploadService::require_protocol(2).is_err());
    }

    #[test]
    fn safely_encodes_object_key_segments() {
        assert_eq!(
            UploadService::object_key_segment("robot one/left", "robotId").unwrap(),
            "robot~20one~2Fleft"
        );
        assert!(UploadService::object_key_segment("", "robotId").is_err());
        assert!(UploadService::object_key_segment("..", "robotId").is_err());
    }
}
