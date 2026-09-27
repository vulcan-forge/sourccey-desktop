use chrono::{DateTime, Utc};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, DbErr, Statement, TryGetable};
use serde::{Deserialize, Serialize};
use sourccey_sync_core::{SyncControlInbox, SyncRequest};

pub const CURRENT_ONBOARDING_VERSION: i32 = 1;
pub const CURRENT_PRIVACY_NOTICE_VERSION: i32 = 1;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyPreferences {
    pub onboarding_completed: bool,
    pub onboarding_version: i32,
    pub privacy_notice_version: i32,
    pub diagnostics_enabled: bool,
    pub dataset_metadata_enabled: bool,
    pub trajectory_upload_enabled: bool,
    pub camera_upload_enabled: bool,
    pub decided_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePrivacyPreferencesRequest {
    pub diagnostics_enabled: bool,
    pub dataset_metadata_enabled: bool,
    pub trajectory_upload_enabled: bool,
    pub camera_upload_enabled: bool,
}

pub struct PrivacyService;

impl PrivacyService {
    pub async fn get(connection: &DatabaseConnection) -> Result<PrivacyPreferences, DbErr> {
        let row = connection
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT onboarding_completed, onboarding_version, privacy_notice_version, \
                 diagnostics_enabled, dataset_metadata_enabled, trajectory_upload_enabled, \
                 camera_upload_enabled, decided_at, updated_at \
                 FROM privacy_preference WHERE singleton_key = 1"
                    .to_string(),
            ))
            .await?
            .ok_or_else(|| DbErr::Custom("privacy preferences are missing".to_string()))?;

        let decided_at: Option<DateTime<Utc>> = row.try_get("", "decided_at")?;
        let updated_at: DateTime<Utc> = row.try_get("", "updated_at")?;

        Ok(PrivacyPreferences {
            onboarding_completed: row.try_get("", "onboarding_completed")?,
            onboarding_version: row.try_get("", "onboarding_version")?,
            privacy_notice_version: row.try_get("", "privacy_notice_version")?,
            diagnostics_enabled: row.try_get("", "diagnostics_enabled")?,
            dataset_metadata_enabled: row.try_get("", "dataset_metadata_enabled")?,
            trajectory_upload_enabled: row.try_get("", "trajectory_upload_enabled")?,
            camera_upload_enabled: row.try_get("", "camera_upload_enabled")?,
            decided_at: decided_at.map(|value| value.to_rfc3339()),
            updated_at: updated_at.to_rfc3339(),
        })
    }

    pub async fn save(
        connection: &DatabaseConnection,
        request: SavePrivacyPreferencesRequest,
    ) -> Result<PrivacyPreferences, DbErr> {
        let previous = Self::get(connection).await?;
        let now = Utc::now();

        connection
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE privacy_preference SET onboarding_completed = 1, onboarding_version = ?, \
                 privacy_notice_version = ?, diagnostics_enabled = ?, dataset_metadata_enabled = ?, \
                 trajectory_upload_enabled = ?, camera_upload_enabled = ?, decided_at = ?, updated_at = ? \
                 WHERE singleton_key = 1",
                [
                    CURRENT_ONBOARDING_VERSION.into(),
                    CURRENT_PRIVACY_NOTICE_VERSION.into(),
                    request.diagnostics_enabled.into(),
                    request.dataset_metadata_enabled.into(),
                    request.trajectory_upload_enabled.into(),
                    request.camera_upload_enabled.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;

        if previous.dataset_metadata_enabled && !request.dataset_metadata_enabled {
            connection
                .execute(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE dataset_metadata_upload SET state = 'cancelled', updated_at = ?, \
                     next_attempt_at = NULL, last_error = 'Cancelled after data sharing was disabled' \
                     WHERE state IN ('queued', 'uploading', 'failed')",
                    [now.into()],
                ))
                .await?;
        }

        Self::submit_sync_user_sharing(request.dataset_metadata_enabled)?;

        Self::get(connection).await
    }

    pub async fn dataset_metadata_enabled(connection: &DatabaseConnection) -> Result<bool, DbErr> {
        Ok(Self::get(connection).await?.dataset_metadata_enabled)
    }

    pub async fn publish_current_sync_state(connection: &DatabaseConnection) -> Result<(), DbErr> {
        let preferences = Self::get(connection).await?;
        let identity = connection
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT installation_id FROM installation_identity WHERE singleton_key = 1"
                    .to_string(),
            ))
            .await?
            .ok_or_else(|| DbErr::Custom("installation identity is missing".to_string()))?;
        let installation_id: String = identity.try_get("", "installation_id")?;
        let inbox = Self::sync_control_inbox()?;
        inbox
            .submit(SyncRequest::AdoptInstallationId { installation_id })
            .map_err(Self::sync_notification_error)?;
        inbox
            .submit(SyncRequest::SetUserSharingEnabled {
                enabled: preferences.dataset_metadata_enabled,
            })
            .map(|_| ())
            .map_err(Self::sync_notification_error)
    }

    fn submit_sync_user_sharing(enabled: bool) -> Result<(), DbErr> {
        Self::sync_control_inbox()?
            .submit(SyncRequest::SetUserSharingEnabled { enabled })
            .map(|_| ())
            .map_err(Self::sync_notification_error)
    }

    fn sync_control_inbox() -> Result<SyncControlInbox, DbErr> {
        let sync_root = dirs::data_local_dir()
            .ok_or_else(|| DbErr::Custom("Local data directory is unavailable".to_string()))?
            .join("Sourccey")
            .join("Sync");
        Ok(SyncControlInbox::new(sync_root.join("control")))
    }

    fn sync_notification_error(error: String) -> DbErr {
        DbErr::Custom(format!(
            "Privacy choice was saved, but Sourccey Sync could not be notified: {error}"
        ))
    }
}
