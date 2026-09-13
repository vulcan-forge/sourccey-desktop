use crate::modules::dataset_sync::types::{
    DatasetSyncIdentity, DiscoveryReport, InstallationRegistrationRequest,
    InstallationRegistrationResponse, JobsReport, MetadataTransmissionReport,
    PresignMetadataRequest, PresignedUpload, QueueDatasetMetadataRequest, QueuedDatasetMetadata,
};
use crate::modules::settings::services::desktop_environment::desktop_environment_service::DesktopEnvironmentService;
use crate::services::directory::directory_service::DirectoryService;
use crate::utils::windows_process::configure_std_command;
use chrono::{DateTime, Utc};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, DbErr, Statement, TryGetable};
use serde::de::DeserializeOwned;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::ffi::OsString;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::Duration;
use uuid::Uuid;

const PROTOCOL_VERSION: u32 = 1;
const STDERR_LIMIT: usize = 4096;

pub struct UploadService;

impl UploadService {
    pub async fn register_on_startup(
        connection: &DatabaseConnection,
    ) -> Result<(), String> {
        let identity = Self::get_identity(connection)
            .await
            .map_err(|error| format!("Failed to load installation identity: {error}"))?;
        let api_base = Self::dataset_sync_api_base_url()?;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| format!("Failed to initialize dataset sync client: {error}"))?;

        Self::register_installation(&client, &api_base, &identity.installation_id).await?;
        Ok(())
    }

    pub async fn retry_metadata_on_startup(
        connection: &DatabaseConnection,
    ) -> Result<MetadataTransmissionReport, String> {
        connection
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE dataset_metadata_upload \
                 SET state = 'queued', updated_at = ?, next_attempt_at = NULL, \
                     last_error = 'Upload interrupted by application shutdown' \
                 WHERE state = 'uploading'",
                [Utc::now().into()],
            ))
            .await
            .map_err(|error| format!("Failed to recover interrupted metadata uploads: {error}"))?;

        Self::transmit_queued_metadata(connection, 20).await
    }

    pub async fn queue_completed_dataset_metadata(
        connection: &DatabaseConnection,
        robot_id: &str,
        repo_id: &str,
    ) -> Result<QueuedDatasetMetadata, String> {
        let dataset_name = Self::dataset_name_from_repo_id(repo_id)?;
        let report = tauri::async_runtime::spawn_blocking(Self::discover_datasets)
            .await
            .map_err(|error| format!("Dataset discovery task failed: {error}"))??;
        let discovery_root = report.root.clone();
        let dataset = report
            .datasets
            .into_iter()
            .find(|candidate| candidate.name == dataset_name)
            .ok_or_else(|| {
                format!(
                    "Dataset {dataset_name} is not yet classified as complete by the sync module"
                )
            })?;
        let info = Self::read_discovered_info(&discovery_root, &dataset.info_path)?;

        Self::queue_metadata(
            connection,
            QueueDatasetMetadataRequest {
                robot_id: robot_id.to_string(),
                dataset_id: repo_id.trim().to_string(),
                metadata: json!({
                    "source": "lerobot-record",
                    "repoId": repo_id.trim(),
                    "info": info,
                    "codebaseVersion": dataset.codebase_version,
                    "totalEpisodes": dataset.total_episodes,
                    "totalFrames": dataset.total_frames,
                }),
            },
        )
        .await
    }

    pub async fn transmit_queued_metadata(
        connection: &DatabaseConnection,
        limit: u64,
    ) -> Result<MetadataTransmissionReport, String> {
        let limit = limit.clamp(1, 100);
        let rows = connection
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, installation_id, robot_id, dataset_id, payload_json, \
                        payload_sha256, attempt_count \
                 FROM dataset_metadata_upload \
                 WHERE state = 'queued' \
                    OR (state = 'failed' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)) \
                 ORDER BY created_at ASC LIMIT ?",
                [Utc::now().into(), limit.into()],
            ))
            .await
            .map_err(|error| format!("Failed to load pending metadata: {error}"))?;

        let mut report = MetadataTransmissionReport {
            attempted: 0,
            completed: 0,
            failed: 0,
        };
        if rows.is_empty() {
            return Ok(report);
        }

        let identity = Self::get_identity(connection)
            .await
            .map_err(|error| format!("Failed to load installation identity: {error}"))?;
        let api_base = Self::dataset_sync_api_base_url()?;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| format!("Failed to initialize dataset sync client: {error}"))?;
        let token =
            Self::register_installation(&client, &api_base, &identity.installation_id).await?;

        for row in rows {
            let id: String = row.try_get("", "id").map_err(|error| error.to_string())?;
            let claimed = connection
                .execute(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE dataset_metadata_upload SET state = 'uploading', updated_at = ? \
                     WHERE id = ? AND state IN ('queued', 'failed')",
                    [Utc::now().into(), id.clone().into()],
                ))
                .await
                .map_err(|error| format!("Failed to claim metadata upload {id}: {error}"))?;
            if claimed.rows_affected() == 0 {
                continue;
            }

            report.attempted += 1;
            let attempt_count: i32 = row
                .try_get("", "attempt_count")
                .map_err(|error| error.to_string())?;
            match Self::transmit_metadata_row(&client, &api_base, &token, &row).await {
                Ok((object_key, etag)) => {
                    connection
                        .execute(Statement::from_sql_and_values(
                            DbBackend::Sqlite,
                            "UPDATE dataset_metadata_upload \
                             SET state = 'completed', object_key = ?, etag = ?, uploaded_at = ?, \
                                 updated_at = ?, attempt_count = attempt_count + 1, \
                                 next_attempt_at = NULL, last_error = NULL WHERE id = ?",
                            [
                                object_key.into(),
                                etag.into(),
                                Utc::now().into(),
                                Utc::now().into(),
                                id.into(),
                            ],
                        ))
                        .await
                        .map_err(|error| format!("Failed to complete metadata upload: {error}"))?;
                    report.completed += 1;
                }
                Err(error) => {
                    Self::mark_metadata_failed(connection, &id, attempt_count, &error).await?;
                    report.failed += 1;
                }
            }
        }

        Ok(report)
    }

    async fn register_installation(
        client: &reqwest::Client,
        api_base: &str,
        installation_id: &str,
    ) -> Result<String, String> {
        let response = client
            .post(format!(
                "{api_base}/api/v1/dataset-sync/installations/register"
            ))
            .json(&InstallationRegistrationRequest {
                installation_id: installation_id.to_string(),
            })
            .send()
            .await
            .map_err(|error| format!("Failed to register dataset sync installation: {error}"))?;
        if !response.status().is_success() {
            let status = response.status();
            let detail: String = response
                .text()
                .await
                .unwrap_or_default()
                .chars()
                .take(1024)
                .collect();
            return Err(format!(
                "Dataset sync registration failed ({status}): {detail}"
            ));
        }

        response
            .json::<InstallationRegistrationResponse>()
            .await
            .map(|payload| payload.installation_token)
            .map_err(|error| format!("Dataset sync registration returned invalid JSON: {error}"))
    }

    async fn transmit_metadata_row(
        client: &reqwest::Client,
        api_base: &str,
        token: &str,
        row: &sea_orm::QueryResult,
    ) -> Result<(String, Option<String>), String> {
        let payload_json: String = row.try_get("", "payload_json").map_err(|e| e.to_string())?;
        let installation_id: String = row
            .try_get("", "installation_id")
            .map_err(|e| e.to_string())?;
        let robot_id: String = row.try_get("", "robot_id").map_err(|e| e.to_string())?;
        let dataset_id: String = row.try_get("", "dataset_id").map_err(|e| e.to_string())?;
        let sha256: String = row
            .try_get("", "payload_sha256")
            .map_err(|e| e.to_string())?;

        let response = client
            .post(format!("{api_base}/api/v1/dataset-sync/uploads/presign"))
            .bearer_auth(token)
            .json(&PresignMetadataRequest {
                installation_id,
                robot_id,
                dataset_id,
                kind: "metadata".to_string(),
                relative_path: None,
                content_type: "application/json".to_string(),
                content_length: payload_json.len() as u64,
                sha256,
            })
            .send()
            .await
            .map_err(|error| format!("Failed to request metadata upload URL: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Metadata upload URL request failed with status {}",
                response.status()
            ));
        }
        let presigned = response
            .json::<PresignedUpload>()
            .await
            .map_err(|error| format!("Metadata upload URL response was invalid: {error}"))?;
        Self::validate_spaces_upload_url(&presigned.upload_url)?;

        let mut upload = client.put(&presigned.upload_url).body(payload_json);
        for (name, value) in &presigned.required_headers {
            if !matches!(
                name.to_ascii_lowercase().as_str(),
                "content-type" | "content-length"
            ) {
                return Err(format!(
                    "Backend returned an unsupported required header: {name}"
                ));
            }
            upload = upload.header(name, value);
        }
        let response = upload
            .send()
            .await
            .map_err(|error| format!("Failed to upload metadata to object storage: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Object storage rejected metadata with status {}",
                response.status()
            ));
        }
        let etag = response
            .headers()
            .get("etag")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        Ok((presigned.object_key, etag))
    }

    async fn mark_metadata_failed(
        connection: &DatabaseConnection,
        id: &str,
        attempt_count: i32,
        error: &str,
    ) -> Result<(), String> {
        let exponent = attempt_count.clamp(0, 8) as u32;
        let delay = chrono::Duration::seconds(30 * 2_i64.pow(exponent));
        let diagnostic: String = error.chars().take(2048).collect();
        connection
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE dataset_metadata_upload \
                 SET state = 'failed', attempt_count = attempt_count + 1, last_error = ?, \
                     next_attempt_at = ?, updated_at = ? WHERE id = ?",
                [
                    diagnostic.into(),
                    (Utc::now() + delay).into(),
                    Utc::now().into(),
                    id.into(),
                ],
            ))
            .await
            .map_err(|db_error| format!("Failed to record metadata upload error: {db_error}"))?;
        Ok(())
    }

    fn dataset_sync_api_base_url() -> Result<String, String> {
        if let Ok(value) = std::env::var("VULCAN_DATASET_SYNC_API_BASE_URL") {
            let normalized = value.trim().trim_end_matches('/');
            if !normalized.is_empty() {
                return Ok(normalized.to_string());
            }
        }
        let graphql_url = DesktopEnvironmentService::get_settings()?.graphql_api_url;
        Ok(graphql_url
            .trim_end_matches('/')
            .strip_suffix("/v1/graphql")
            .unwrap_or(&graphql_url)
            .trim_end_matches('/')
            .to_string())
    }

    fn validate_spaces_upload_url(value: &str) -> Result<(), String> {
        let url = reqwest::Url::parse(value)
            .map_err(|error| format!("Backend returned an invalid upload URL: {error}"))?;
        let host = url.host_str().unwrap_or_default();
        if url.scheme() != "https" || !host.ends_with(".digitaloceanspaces.com") {
            return Err("Backend returned an untrusted upload URL".to_string());
        }
        Ok(())
    }

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

    fn dataset_name_from_repo_id(repo_id: &str) -> Result<String, String> {
        let normalized = repo_id.trim().trim_end_matches('/');
        let name = normalized.rsplit('/').next().unwrap_or_default();
        if name.is_empty() || matches!(name, "." | "..") {
            return Err("Recording repo ID does not contain a valid dataset name".to_string());
        }
        Ok(name.to_string())
    }

    fn read_discovered_info(root: &str, info_path: &str) -> Result<serde_json::Value, String> {
        const MAX_INFO_BYTES: u64 = 1024 * 1024;

        let root = fs::canonicalize(root)
            .map_err(|error| format!("Failed to validate dataset root: {error}"))?;
        let supplied_path = Path::new(info_path);
        let supplied_metadata = fs::symlink_metadata(supplied_path)
            .map_err(|error| format!("Failed to inspect dataset metadata: {error}"))?;
        if supplied_metadata.file_type().is_symlink() || !supplied_metadata.is_file() {
            return Err("Dataset metadata must be a regular, non-symlink file".to_string());
        }
        if supplied_metadata.len() > MAX_INFO_BYTES {
            return Err("Dataset metadata exceeds the 1 MiB safety limit".to_string());
        }

        let canonical_info = fs::canonicalize(supplied_path)
            .map_err(|error| format!("Failed to validate dataset metadata path: {error}"))?;
        if !canonical_info.starts_with(&root) {
            return Err("Dataset metadata path escapes the approved LeRobot root".to_string());
        }

        let bytes = fs::read(&canonical_info)
            .map_err(|error| format!("Failed to read completed dataset metadata: {error}"))?;
        serde_json::from_slice(&bytes)
            .map_err(|error| format!("Completed dataset metadata is invalid JSON: {error}"))
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

    #[test]
    fn derives_dataset_name_from_lerobot_repo_id() {
        assert_eq!(
            UploadService::dataset_name_from_repo_id("local/folding-shirts").unwrap(),
            "folding-shirts"
        );
        assert!(UploadService::dataset_name_from_repo_id("/").is_err());
    }

    #[test]
    fn accepts_only_digitalocean_spaces_upload_urls() {
        assert!(UploadService::validate_spaces_upload_url(
            "https://bucket.nyc3.digitaloceanspaces.com/key?signature=test"
        )
        .is_ok());
        assert!(UploadService::validate_spaces_upload_url("https://example.com/key").is_err());
        assert!(UploadService::validate_spaces_upload_url(
            "http://bucket.nyc3.digitaloceanspaces.com/key"
        )
        .is_err());
    }
}
