use crate::database::{MetadataUploadJob, SyncDatabase};
use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sourccey_sync_core::{sha256_json, SyncCloudContext};
use std::collections::HashMap;
use std::time::Duration;

pub struct MetadataUploader {
    client: Client,
    token: Option<CachedToken>,
}

struct CachedToken {
    context: SyncCloudContext,
    value: String,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadReport {
    pub attempted: u64,
    pub uploaded: u64,
    pub failed: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
struct InstallationRegistrationRequest<'a> {
    installation_id: &'a str,
    account_id: Option<&'a str>,
    diagnostics_enabled: bool,
    user_data_sharing_enabled: bool,
    privacy_notice_version: u32,
    consent_updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
struct InstallationRegistrationResponse {
    installation_token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
struct PresignMetadataRequest<'a> {
    installation_id: &'a str,
    robot_id: &'a str,
    dataset_id: &'a str,
    kind: &'static str,
    relative_path: Option<&'static str>,
    content_type: &'static str,
    content_length: u64,
    sha256: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
struct PresignedUpload {
    upload_url: String,
    object_key: String,
    required_headers: HashMap<String, String>,
}

impl MetadataUploader {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(60))
            .redirect(Policy::none())
            .build()
            .map_err(|error| format!("failed to initialize metadata upload client: {error}"))?;
        Ok(Self {
            client,
            token: None,
        })
    }

    pub fn process_ready(
        &mut self,
        database: &mut SyncDatabase,
        limit: u64,
    ) -> Result<UploadReport, String> {
        let Some(mut context) = database.cloud_context()? else {
            return Ok(UploadReport::default());
        };
        if let Ok(value) = std::env::var("VULCAN_DATASET_SYNC_API_BASE_URL") {
            let value = value.trim().trim_end_matches('/');
            if !value.is_empty() {
                context.api_base_url = value.to_string();
            }
        }
        context.validate()?;
        let token = self.ensure_token(&context)?;
        let mut report = UploadReport::default();

        for _ in 0..limit.clamp(1, 20) {
            let Some(job) = database.claim_metadata_upload()? else {
                break;
            };
            report.attempted += 1;
            match self.upload_metadata(&context, &token, &job) {
                Ok(uploaded) => {
                    database.mark_metadata_uploaded(
                        &job.id,
                        &uploaded.object_key,
                        uploaded.etag.as_deref(),
                        &uploaded.payload_sha256,
                        uploaded.bytes_total,
                    )?;
                    report.uploaded += 1;
                }
                Err(error) => {
                    database.mark_metadata_failed(&job.id, job.attempt_count, &error)?;
                    eprintln!("Metadata upload {} failed: {error}", job.repo_id);
                    report.failed += 1;
                }
            }
        }
        Ok(report)
    }

    fn ensure_token(&mut self, context: &SyncCloudContext) -> Result<String, String> {
        if let Some(cached) = &self.token {
            if cached.context == *context {
                return Ok(cached.value.clone());
            }
        }
        let response = self
            .client
            .post(format!(
                "{}/api/v1/dataset-sync/installations/register",
                context.api_base_url.trim_end_matches('/')
            ))
            .json(&InstallationRegistrationRequest {
                installation_id: &context.installation_id,
                account_id: context.account_id.as_deref(),
                diagnostics_enabled: context.diagnostics_enabled,
                user_data_sharing_enabled: context.user_data_sharing_enabled,
                privacy_notice_version: context.privacy_notice_version,
                consent_updated_at: context.consent_updated_at.to_rfc3339(),
            })
            .send()
            .map_err(|error| format!("installation registration failed: {error}"))?;
        if !response.status().is_success() {
            return Err(response_error("installation registration", response));
        }
        let registration = response
            .json::<InstallationRegistrationResponse>()
            .map_err(|error| format!("installation registration returned invalid JSON: {error}"))?;
        if registration.installation_token.trim().is_empty() {
            return Err("installation registration returned an empty token".to_string());
        }
        self.token = Some(CachedToken {
            context: context.clone(),
            value: registration.installation_token.clone(),
        });
        Ok(registration.installation_token)
    }

    fn upload_metadata(
        &self,
        context: &SyncCloudContext,
        token: &str,
        job: &MetadataUploadJob,
    ) -> Result<UploadedMetadata, String> {
        let payload = json!({
            "schemaVersion": 1,
            "installationId": job.installation_id,
            "customerId": job.account_id,
            "robotId": job.robot_id,
            "datasetId": job.repo_id,
            "metadata": {
                "source": "sourccey-sync",
                "repoId": job.repo_id,
                "info": job.metadata,
                "codebaseVersion": job.codebase_version,
                "totalEpisodes": job.total_episodes,
                "totalFrames": job.total_frames,
            }
        });
        let payload_json = serde_json::to_string(&payload)
            .map_err(|error| format!("failed to serialize metadata payload: {error}"))?;
        let payload_sha256 = sha256_json(&payload)?;
        let response = self
            .client
            .post(format!(
                "{}/api/v1/dataset-sync/uploads/presign",
                context.api_base_url.trim_end_matches('/')
            ))
            .bearer_auth(token)
            .json(&PresignMetadataRequest {
                installation_id: &job.installation_id,
                robot_id: &job.robot_id,
                dataset_id: &job.repo_id,
                kind: "metadata",
                relative_path: None,
                content_type: "application/json",
                content_length: payload_json.len() as u64,
                sha256: &payload_sha256,
            })
            .send()
            .map_err(|error| format!("metadata presign request failed: {error}"))?;
        if !response.status().is_success() {
            return Err(response_error("metadata presign request", response));
        }
        let presigned = response
            .json::<PresignedUpload>()
            .map_err(|error| format!("metadata presign response was invalid: {error}"))?;
        validate_upload_url(&presigned.upload_url)?;

        let mut upload = self
            .client
            .put(&presigned.upload_url)
            .body(payload_json.clone());
        for (name, value) in &presigned.required_headers {
            if !matches!(
                name.to_ascii_lowercase().as_str(),
                "content-type" | "content-length"
            ) {
                return Err(format!(
                    "backend returned an unsupported upload header: {name}"
                ));
            }
            upload = upload.header(name, value);
        }
        let response = upload
            .send()
            .map_err(|error| format!("metadata object upload failed: {error}"))?;
        if !response.status().is_success() {
            return Err(response_error("metadata object upload", response));
        }
        let etag = response
            .headers()
            .get("etag")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        Ok(UploadedMetadata {
            object_key: presigned.object_key,
            etag,
            payload_sha256,
            bytes_total: payload_json.len() as u64,
        })
    }
}

struct UploadedMetadata {
    object_key: String,
    etag: Option<String>,
    payload_sha256: String,
    bytes_total: u64,
}

fn response_error(action: &str, response: reqwest::blocking::Response) -> String {
    let status = response.status();
    let detail: String = response
        .text()
        .unwrap_or_default()
        .chars()
        .take(1024)
        .collect();
    format!("{action} failed ({status}): {detail}")
}

fn validate_upload_url(value: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(value)
        .map_err(|error| format!("backend returned an invalid upload URL: {error}"))?;
    let host = url.host_str().unwrap_or_default();
    if url.scheme() != "https" || !host.ends_with(".digitaloceanspaces.com") {
        return Err("backend returned an untrusted upload URL".to_string());
    }
    Ok(())
}
