use crate::catalog::DiscoveredDataset;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, Transaction};
use serde::Serialize;
use sourccey_sync_core::{
    validate_installation_id, AdminDatasetPolicy, DatasetCompletedEvent, DatasetSharingLevel,
};
use std::path::{Path, PathBuf};
use uuid::Uuid;

const BOOTSTRAP_POLICY_ID: &str = "bootstrap-metadata-default";

pub struct SyncDatabase {
    connection: Connection,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub active: bool,
    pub installation_id: String,
    pub user_sharing_enabled: bool,
    pub admin_sharing_level: DatasetSharingLevel,
    pub effective_sharing_level: DatasetSharingLevel,
    pub admin_policy_id: String,
    pub admin_policy_version: u64,
    pub admin_policy_applies_to_existing: bool,
    pub dataset_root: PathBuf,
    pub datasets: u64,
    pub available_datasets: u64,
    pub missing_datasets: u64,
    pub metadata_uploaded: u64,
    pub full_datasets_uploaded: u64,
    pub queued_metadata: u64,
    pub queued_full_datasets: u64,
    pub failed_jobs: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetStatus {
    pub id: String,
    pub repo_id: String,
    pub dataset_name: String,
    pub local_state: String,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub last_recorded_at: Option<String>,
    pub revision_id: Option<String>,
    pub metadata_sha256: Option<String>,
    pub total_episodes: Option<u64>,
    pub total_frames: Option<u64>,
    pub metadata_upload_state: Option<String>,
    pub full_dataset_upload_state: Option<String>,
    pub metadata_uploaded: bool,
    pub full_dataset_uploaded: bool,
}

struct RevisionUpsert {
    id: String,
    inserted: bool,
    recorded_effective_level: DatasetSharingLevel,
}

impl SyncDatabase {
    pub fn open(path: &Path, default_dataset_root: &Path) -> Result<Self, String> {
        let connection = Connection::open(path)
            .map_err(|error| format!("failed to open sync database: {error}"))?;
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|error| format!("failed to configure sync database: {error}"))?;
        connection
            .execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
            .map_err(|error| format!("failed to configure sync database: {error}"))?;
        archive_pre_catalog_schema(&connection)?;
        archive_pre_policy_schema(&connection)?;
        connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS installation_identity (
                    singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
                    installation_id TEXT NOT NULL UNIQUE,
                    account_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_policy_sync_at TEXT
                 );
                 CREATE TABLE IF NOT EXISTS sharing_policy (
                    singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
                    user_sharing_enabled INTEGER NOT NULL CHECK (user_sharing_enabled IN (0, 1)),
                    admin_policy_id TEXT NOT NULL,
                    admin_policy_version INTEGER NOT NULL CHECK (admin_policy_version >= 0),
                    admin_sharing_level TEXT NOT NULL CHECK (admin_sharing_level IN ('all', 'metadata', 'nothing')),
                    admin_policy_applies_to_existing INTEGER NOT NULL CHECK (admin_policy_applies_to_existing IN (0, 1)),
                    admin_policy_issued_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS sync_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS local_dataset (
                    id TEXT PRIMARY KEY,
                    repo_id TEXT NOT NULL UNIQUE,
                    dataset_name TEXT NOT NULL UNIQUE,
                    first_seen_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    last_recorded_at TEXT,
                    local_state TEXT NOT NULL CHECK (local_state IN ('available', 'missing'))
                 );
                 CREATE TABLE IF NOT EXISTS dataset_revision (
                    id TEXT PRIMARY KEY,
                    dataset_id TEXT NOT NULL,
                    completion_event_id TEXT UNIQUE,
                    robot_id TEXT,
                    metadata_json TEXT NOT NULL,
                    metadata_sha256 TEXT NOT NULL,
                    total_episodes INTEGER NOT NULL,
                    total_frames INTEGER NOT NULL,
                    codebase_version TEXT NOT NULL,
                    user_sharing_enabled_at_completion INTEGER NOT NULL CHECK (user_sharing_enabled_at_completion IN (0, 1)),
                    effective_sharing_level TEXT NOT NULL CHECK (effective_sharing_level IN ('all', 'metadata', 'nothing')),
                    admin_policy_id TEXT NOT NULL,
                    admin_policy_version INTEGER NOT NULL,
                    privacy_notice_version INTEGER NOT NULL,
                    source TEXT NOT NULL CHECK (source IN ('completion', 'reconciliation')),
                    completed_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(dataset_id, metadata_sha256),
                    FOREIGN KEY(dataset_id) REFERENCES local_dataset(id) ON DELETE CASCADE
                 );
                 CREATE TABLE IF NOT EXISTS upload_job (
                    id TEXT PRIMARY KEY,
                    dataset_revision_id TEXT NOT NULL,
                    kind TEXT NOT NULL CHECK (kind IN ('metadata', 'full_dataset')),
                    state TEXT NOT NULL CHECK (state IN ('queued', 'uploading', 'uploaded', 'failed', 'cancelled', 'missing', 'superseded')),
                    attempt_count INTEGER NOT NULL DEFAULT 0,
                    next_attempt_at TEXT,
                    bytes_total INTEGER,
                    bytes_uploaded INTEGER NOT NULL DEFAULT 0,
                    remote_upload_id TEXT,
                    object_key TEXT,
                    etag TEXT,
                    content_sha256 TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    uploaded_at TEXT,
                    UNIQUE(dataset_revision_id, kind),
                    FOREIGN KEY(dataset_revision_id) REFERENCES dataset_revision(id) ON DELETE CASCADE
                 );
                 CREATE INDEX IF NOT EXISTS ix_dataset_revision_v3_dataset
                    ON dataset_revision(dataset_id, completed_at DESC);
                 CREATE INDEX IF NOT EXISTS ix_upload_job_v3_ready
                    ON upload_job(state, next_attempt_at, created_at);
                 PRAGMA user_version = 3;",
            )
            .map_err(|error| format!("failed to migrate sync database: {error}"))?;

        let now = Utc::now().to_rfc3339();
        connection
            .execute(
                "INSERT OR IGNORE INTO installation_identity
                 (singleton_key, installation_id, created_at, updated_at)
                 VALUES (1, ?, ?, ?)",
                params![format!("inst_{}", Uuid::now_v7()), now, now],
            )
            .map_err(|error| format!("failed to initialize installation identity: {error}"))?;
        connection
            .execute(
                "INSERT OR IGNORE INTO sharing_policy
                 (singleton_key, user_sharing_enabled, admin_policy_id, admin_policy_version,
                  admin_sharing_level, admin_policy_applies_to_existing,
                  admin_policy_issued_at, updated_at)
                 VALUES (1, 0, ?, 0, 'metadata', 0, ?, ?)",
                params![BOOTSTRAP_POLICY_ID, now, now],
            )
            .map_err(|error| format!("failed to initialize sharing policy: {error}"))?;
        connection
            .execute(
                "INSERT OR IGNORE INTO sync_config (key, value, updated_at)
                 VALUES ('dataset_root', ?, ?)",
                params![normalize_dataset_root(default_dataset_root)?, now],
            )
            .map_err(|error| format!("failed to initialize dataset root: {error}"))?;
        Ok(Self { connection })
    }

    pub fn installation_id(&self) -> Result<String, String> {
        self.connection
            .query_row(
                "SELECT installation_id FROM installation_identity WHERE singleton_key = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| format!("failed to load installation ID: {error}"))
    }

    pub fn adopt_installation_id(&mut self, installation_id: &str) -> Result<(), String> {
        validate_installation_id(installation_id)?;
        let current = self.installation_id()?;
        if current == installation_id {
            return Ok(());
        }
        let bound: bool = self
            .connection
            .query_row(
                "SELECT account_id IS NOT NULL OR last_policy_sync_at IS NOT NULL
                 FROM installation_identity WHERE singleton_key = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| format!("failed to inspect installation binding: {error}"))?;
        if bound {
            return Err("cannot replace an installation ID after cloud enrollment".to_string());
        }
        self.connection
            .execute(
                "UPDATE installation_identity SET installation_id = ?, updated_at = ?
                 WHERE singleton_key = 1",
                params![installation_id, Utc::now().to_rfc3339()],
            )
            .map_err(|error| format!("failed to adopt installation ID: {error}"))?;
        Ok(())
    }

    pub fn user_sharing_enabled(&self) -> Result<bool, String> {
        self.connection
            .query_row(
                "SELECT user_sharing_enabled FROM sharing_policy WHERE singleton_key = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| format!("failed to load user sharing preference: {error}"))
    }

    pub fn admin_policy(&self) -> Result<AdminDatasetPolicy, String> {
        self.connection
            .query_row(
                "SELECT admin_policy_id, admin_policy_version, admin_sharing_level,
                        admin_policy_applies_to_existing, admin_policy_issued_at
                 FROM sharing_policy WHERE singleton_key = 1",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, bool>(3)?,
                        row.get::<_, String>(4)?,
                    ))
                },
            )
            .map_err(|error| format!("failed to load admin sharing policy: {error}"))
            .and_then(
                |(policy_id, version, level, applies_to_existing, issued_at)| {
                    Ok(AdminDatasetPolicy {
                        policy_id,
                        version: u64::try_from(version)
                            .map_err(|_| "admin policy version is invalid".to_string())?,
                        level: level.parse()?,
                        applies_to_existing,
                        issued_at: DateTime::parse_from_rfc3339(&issued_at)
                            .map_err(|error| format!("admin policy timestamp is invalid: {error}"))?
                            .with_timezone(&Utc),
                    })
                },
            )
    }

    pub fn effective_sharing_level(&self) -> Result<DatasetSharingLevel, String> {
        if !self.user_sharing_enabled()? {
            return Ok(DatasetSharingLevel::Nothing);
        }
        Ok(self.admin_policy()?.level)
    }

    pub fn is_active(&self) -> Result<bool, String> {
        Ok(self.effective_sharing_level()? != DatasetSharingLevel::Nothing)
    }

    pub fn dataset_root(&self) -> Result<PathBuf, String> {
        let value: String = self
            .connection
            .query_row(
                "SELECT value FROM sync_config WHERE key = 'dataset_root'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| format!("failed to load dataset root: {error}"))?;
        Ok(PathBuf::from(value))
    }

    pub fn set_dataset_root(&mut self, path: &Path) -> Result<PathBuf, String> {
        let normalized = normalize_dataset_root(path)?;
        self.connection
            .execute(
                "UPDATE sync_config SET value = ?, updated_at = ? WHERE key = 'dataset_root'",
                params![normalized, Utc::now().to_rfc3339()],
            )
            .map_err(|error| format!("failed to update dataset root: {error}"))?;
        Ok(PathBuf::from(normalized))
    }

    pub fn set_user_sharing_enabled(&mut self, enabled: bool) -> Result<(), String> {
        let transaction = self
            .connection
            .transaction()
            .map_err(|error| format!("failed to start user preference update: {error}"))?;
        let now = Utc::now().to_rfc3339();
        transaction
            .execute(
                "UPDATE sharing_policy
                 SET user_sharing_enabled = ?, updated_at = ? WHERE singleton_key = 1",
                params![enabled, now],
            )
            .map_err(|error| format!("failed to update user sharing preference: {error}"))?;
        if !enabled {
            cancel_jobs(&transaction, None, &now, "user disabled data sharing")?;
        }
        transaction
            .commit()
            .map_err(|error| format!("failed to commit user preference update: {error}"))
    }

    /// Reserved for a trusted cloud-policy client. This is deliberately not exposed
    /// through the desktop control inbox or a user-facing command.
    #[allow(dead_code)]
    pub fn apply_admin_policy(&mut self, policy: &AdminDatasetPolicy) -> Result<bool, String> {
        policy.validate()?;
        let current = self.admin_policy()?;
        if policy.version < current.version {
            return Err(format!(
                "admin policy version {} is older than installed version {}",
                policy.version, current.version
            ));
        }
        if policy.version == current.version {
            if policy == &current {
                return Ok(false);
            }
            return Err("admin policy version conflicts with the installed policy".to_string());
        }

        let transaction = self
            .connection
            .transaction()
            .map_err(|error| format!("failed to start admin policy update: {error}"))?;
        let now = Utc::now().to_rfc3339();
        transaction
            .execute(
                "UPDATE sharing_policy SET admin_policy_id = ?, admin_policy_version = ?,
                 admin_sharing_level = ?, admin_policy_applies_to_existing = ?,
                 admin_policy_issued_at = ?, updated_at = ? WHERE singleton_key = 1",
                params![
                    policy.policy_id.as_str(),
                    policy.version as i64,
                    policy.level.to_string(),
                    policy.applies_to_existing,
                    policy.issued_at.to_rfc3339(),
                    now,
                ],
            )
            .map_err(|error| format!("failed to store admin sharing policy: {error}"))?;

        match policy.level {
            DatasetSharingLevel::All => {}
            DatasetSharingLevel::Metadata => {
                transaction
                    .execute(
                        "UPDATE dataset_revision SET effective_sharing_level = 'metadata'
                         WHERE effective_sharing_level = 'all'",
                        [],
                    )
                    .map_err(|error| format!("failed to cap existing revision policy: {error}"))?;
                cancel_jobs(
                    &transaction,
                    Some("full_dataset"),
                    &now,
                    "admin policy no longer permits full datasets",
                )?;
            }
            DatasetSharingLevel::Nothing => {
                transaction
                    .execute(
                        "UPDATE dataset_revision SET effective_sharing_level = 'nothing'
                         WHERE effective_sharing_level != 'nothing'",
                        [],
                    )
                    .map_err(|error| format!("failed to cap existing revision policy: {error}"))?;
                cancel_jobs(
                    &transaction,
                    None,
                    &now,
                    "admin policy disabled dataset sharing",
                )?;
            }
        }
        transaction
            .commit()
            .map_err(|error| format!("failed to commit admin policy update: {error}"))?;
        Ok(true)
    }

    pub fn ingest_completion_event(&mut self, event: &DatasetCompletedEvent) -> Result<(), String> {
        event.validate()?;
        let user_sharing_enabled = self.user_sharing_enabled()?;
        let policy = self.admin_policy()?;
        if !user_sharing_enabled
            || !event.user_sharing_enabled_at_completion
            || policy.level == DatasetSharingLevel::Nothing
        {
            return Ok(());
        }

        let transaction = self
            .connection
            .transaction()
            .map_err(|error| format!("failed to start inbox transaction: {error}"))?;
        let now = Utc::now().to_rfc3339();
        let dataset_id = upsert_local_dataset(
            &transaction,
            &event.dataset_name,
            &event.repo_id,
            &event.completed_at.to_rfc3339(),
            true,
        )?;
        let metadata_json = serde_json::to_string(&event.metadata)
            .map_err(|error| format!("failed to serialize dataset metadata: {error}"))?;
        let revision = upsert_revision(
            &transaction,
            &dataset_id,
            Some(event.dataset_revision_id.to_string()),
            Some(event.event_id.to_string()),
            Some(event.robot_id.as_str()),
            &metadata_json,
            &event.metadata_sha256,
            metadata_u64(&event.metadata, "total_episodes"),
            metadata_u64(&event.metadata, "total_frames"),
            event
                .metadata
                .get("codebase_version")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("unknown"),
            event.user_sharing_enabled_at_completion,
            policy.level,
            &policy,
            event.privacy_notice_version,
            "completion",
            &event.completed_at.to_rfc3339(),
            &now,
        )?;
        let allowed =
            allowed_level_for_revision(&revision, policy.level, policy.applies_to_existing);
        queue_allowed_jobs(&transaction, &revision.id, allowed, &now)?;
        transaction
            .commit()
            .map_err(|error| format!("failed to commit completed dataset: {error}"))
    }

    pub fn reconcile_catalog(&mut self, datasets: &[DiscoveredDataset]) -> Result<(), String> {
        let user_sharing_enabled = self.user_sharing_enabled()?;
        let policy = self.admin_policy()?;
        if !user_sharing_enabled || policy.level == DatasetSharingLevel::Nothing {
            return Ok(());
        }
        let transaction = self
            .connection
            .transaction()
            .map_err(|error| format!("failed to start catalog reconciliation: {error}"))?;
        let now = Utc::now().to_rfc3339();
        transaction
            .execute("UPDATE local_dataset SET local_state = 'missing'", [])
            .map_err(|error| format!("failed to prepare catalog reconciliation: {error}"))?;

        for dataset in datasets {
            let observed_at = dataset.observed_at.to_rfc3339();
            let dataset_id = upsert_local_dataset(
                &transaction,
                &dataset.dataset_name,
                &dataset.repo_id,
                &observed_at,
                false,
            )?;
            let metadata_json = serde_json::to_string(&dataset.metadata)
                .map_err(|error| format!("failed to serialize dataset metadata: {error}"))?;
            let revision = upsert_revision(
                &transaction,
                &dataset_id,
                None,
                None,
                None,
                &metadata_json,
                &dataset.metadata_sha256,
                dataset.total_episodes,
                dataset.total_frames,
                &dataset.codebase_version,
                true,
                policy.level,
                &policy,
                0,
                "reconciliation",
                &observed_at,
                &now,
            )?;
            let allowed =
                allowed_level_for_revision(&revision, policy.level, policy.applies_to_existing);
            queue_allowed_jobs(&transaction, &revision.id, allowed, &now)?;
        }

        transaction
            .execute(
                "UPDATE upload_job SET state = 'missing', updated_at = ?,
                 last_error = 'Local dataset is no longer available'
                 WHERE kind = 'full_dataset' AND state IN ('queued', 'uploading', 'failed')
                 AND dataset_revision_id IN (
                    SELECT r.id FROM dataset_revision r
                    JOIN local_dataset d ON d.id = r.dataset_id
                    WHERE d.local_state = 'missing'
                 )",
                [&now],
            )
            .map_err(|error| format!("failed to mark missing dataset uploads: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("failed to commit catalog reconciliation: {error}"))
    }

    pub fn status(&self) -> Result<SyncStatus, String> {
        let user_sharing_enabled = self.user_sharing_enabled()?;
        let admin_policy = self.admin_policy()?;
        let effective_sharing_level = if user_sharing_enabled {
            admin_policy.level
        } else {
            DatasetSharingLevel::Nothing
        };
        Ok(SyncStatus {
            active: effective_sharing_level != DatasetSharingLevel::Nothing,
            installation_id: self.installation_id()?,
            user_sharing_enabled,
            admin_sharing_level: admin_policy.level,
            effective_sharing_level,
            admin_policy_id: admin_policy.policy_id,
            admin_policy_version: admin_policy.version,
            admin_policy_applies_to_existing: admin_policy.applies_to_existing,
            dataset_root: self.dataset_root()?,
            datasets: count(&self.connection, "SELECT COUNT(*) FROM local_dataset")?,
            available_datasets: count(
                &self.connection,
                "SELECT COUNT(*) FROM local_dataset WHERE local_state = 'available'",
            )?,
            missing_datasets: count(
                &self.connection,
                "SELECT COUNT(*) FROM local_dataset WHERE local_state = 'missing'",
            )?,
            metadata_uploaded: job_count(&self.connection, "metadata", "uploaded")?,
            full_datasets_uploaded: job_count(&self.connection, "full_dataset", "uploaded")?,
            queued_metadata: job_count(&self.connection, "metadata", "queued")?,
            queued_full_datasets: job_count(&self.connection, "full_dataset", "queued")?,
            failed_jobs: count(
                &self.connection,
                "SELECT COUNT(*) FROM upload_job WHERE state = 'failed'",
            )?,
        })
    }

    pub fn datasets(&self) -> Result<Vec<DatasetStatus>, String> {
        let mut statement = self.connection.prepare(
            "SELECT d.id, d.repo_id, d.dataset_name, d.local_state, d.first_seen_at,
                    d.last_seen_at, d.last_recorded_at, r.id, r.metadata_sha256,
                    r.total_episodes, r.total_frames,
                    (SELECT state FROM upload_job WHERE dataset_revision_id = r.id AND kind = 'metadata'),
                    (SELECT state FROM upload_job WHERE dataset_revision_id = r.id AND kind = 'full_dataset')
             FROM local_dataset d
             LEFT JOIN dataset_revision r ON r.id = (
                SELECT latest.id FROM dataset_revision latest WHERE latest.dataset_id = d.id
                ORDER BY latest.completed_at DESC, latest.created_at DESC LIMIT 1
             )
             ORDER BY d.last_seen_at DESC, d.repo_id ASC",
        ).map_err(|error| format!("failed to prepare dataset status query: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                let metadata_upload_state: Option<String> = row.get(11)?;
                let full_dataset_upload_state: Option<String> = row.get(12)?;
                Ok(DatasetStatus {
                    id: row.get(0)?,
                    repo_id: row.get(1)?,
                    dataset_name: row.get(2)?,
                    local_state: row.get(3)?,
                    first_seen_at: row.get(4)?,
                    last_seen_at: row.get(5)?,
                    last_recorded_at: row.get(6)?,
                    revision_id: row.get(7)?,
                    metadata_sha256: row.get(8)?,
                    total_episodes: row.get(9)?,
                    total_frames: row.get(10)?,
                    metadata_uploaded: metadata_upload_state.as_deref() == Some("uploaded"),
                    full_dataset_uploaded: full_dataset_upload_state.as_deref() == Some("uploaded"),
                    metadata_upload_state,
                    full_dataset_upload_state,
                })
            })
            .map_err(|error| format!("failed to load dataset statuses: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("failed to decode dataset statuses: {error}"))
    }
}

fn allowed_level_for_revision(
    revision: &RevisionUpsert,
    current_level: DatasetSharingLevel,
    applies_to_existing: bool,
) -> DatasetSharingLevel {
    if revision.inserted || applies_to_existing {
        current_level
    } else {
        revision.recorded_effective_level.intersect(current_level)
    }
}

fn archive_pre_catalog_schema(connection: &Connection) -> Result<(), String> {
    if table_exists(connection, "upload_job")?
        && !column_exists(connection, "upload_job", "dataset_revision_id")?
        && !table_exists(connection, "upload_job_legacy_v1")?
    {
        connection
            .execute_batch("ALTER TABLE upload_job RENAME TO upload_job_legacy_v1;")
            .map_err(|error| format!("failed to archive preliminary upload schema: {error}"))?;
    }
    if table_exists(connection, "dataset_record")?
        && !table_exists(connection, "dataset_record_legacy_v1")?
    {
        connection
            .execute_batch("ALTER TABLE dataset_record RENAME TO dataset_record_legacy_v1;")
            .map_err(|error| format!("failed to archive preliminary dataset schema: {error}"))?;
    }
    Ok(())
}

fn archive_pre_policy_schema(connection: &Connection) -> Result<(), String> {
    if !table_exists(connection, "dataset_revision")?
        || column_exists(
            connection,
            "dataset_revision",
            "user_sharing_enabled_at_completion",
        )?
    {
        return Ok(());
    }
    if table_exists(connection, "dataset_revision_policy_v2")? {
        return Err(
            "cannot archive the old policy schema because its archive already exists".to_string(),
        );
    }
    if table_exists(connection, "upload_job")? {
        if table_exists(connection, "upload_job_policy_v2")? {
            return Err(
                "cannot archive the old upload schema because its archive already exists"
                    .to_string(),
            );
        }
        connection
            .execute_batch("ALTER TABLE upload_job RENAME TO upload_job_policy_v2;")
            .map_err(|error| format!("failed to archive previous upload policy schema: {error}"))?;
    }
    connection
        .execute_batch("ALTER TABLE dataset_revision RENAME TO dataset_revision_policy_v2;")
        .map_err(|error| format!("failed to archive previous revision policy schema: {error}"))
}

fn table_exists(connection: &Connection, table: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?)",
            [table],
            |row| row.get(0),
        )
        .map_err(|error| format!("failed to inspect sync schema: {error}"))
}

fn column_exists(connection: &Connection, table: &str, column: &str) -> Result<bool, String> {
    let query = format!("PRAGMA table_info({table})");
    let mut statement = connection
        .prepare(&query)
        .map_err(|error| format!("failed to inspect sync columns: {error}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("failed to inspect sync columns: {error}"))?;
    for result in columns {
        if result.map_err(|error| error.to_string())? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn normalize_dataset_root(path: &Path) -> Result<String, String> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|error| format!("failed to resolve dataset root: {error}"))?
            .join(path)
    };
    if absolute.file_name().and_then(|name| name.to_str()) != Some("vulcan-studio") {
        return Err("dataset root must end with the vulcan-studio directory".to_string());
    }
    Ok(absolute.to_string_lossy().to_string())
}

fn upsert_local_dataset(
    transaction: &Transaction<'_>,
    dataset_name: &str,
    repo_id: &str,
    observed_at: &str,
    recorded: bool,
) -> Result<String, String> {
    let id = Uuid::now_v7().to_string();
    transaction
        .execute(
            "INSERT INTO local_dataset
             (id, repo_id, dataset_name, first_seen_at, last_seen_at, last_recorded_at, local_state)
             VALUES (?, ?, ?, ?, ?, ?, 'available')
             ON CONFLICT(repo_id) DO UPDATE SET
                dataset_name = excluded.dataset_name,
                last_seen_at = excluded.last_seen_at,
                last_recorded_at = COALESCE(excluded.last_recorded_at, local_dataset.last_recorded_at),
                local_state = 'available'",
            params![id, repo_id, dataset_name, observed_at, observed_at, recorded.then_some(observed_at)],
        )
        .map_err(|error| format!("failed to store local dataset: {error}"))?;
    transaction
        .query_row(
            "SELECT id FROM local_dataset WHERE repo_id = ?",
            [repo_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("failed to reload local dataset: {error}"))
}

#[allow(clippy::too_many_arguments)]
fn upsert_revision(
    transaction: &Transaction<'_>,
    dataset_id: &str,
    preferred_id: Option<String>,
    completion_event_id: Option<String>,
    robot_id: Option<&str>,
    metadata_json: &str,
    metadata_sha256: &str,
    total_episodes: u64,
    total_frames: u64,
    codebase_version: &str,
    user_sharing_enabled: bool,
    effective_level: DatasetSharingLevel,
    policy: &AdminDatasetPolicy,
    privacy_notice_version: u32,
    source: &str,
    completed_at: &str,
    created_at: &str,
) -> Result<RevisionUpsert, String> {
    let id = preferred_id.unwrap_or_else(|| Uuid::now_v7().to_string());
    let inserted = transaction
        .execute(
            "INSERT OR IGNORE INTO dataset_revision
             (id, dataset_id, completion_event_id, robot_id, metadata_json, metadata_sha256,
              total_episodes, total_frames, codebase_version,
              user_sharing_enabled_at_completion, effective_sharing_level,
              admin_policy_id, admin_policy_version, privacy_notice_version,
              source, completed_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                dataset_id,
                completion_event_id,
                robot_id,
                metadata_json,
                metadata_sha256,
                total_episodes,
                total_frames,
                codebase_version,
                user_sharing_enabled,
                effective_level.to_string(),
                policy.policy_id.as_str(),
                policy.version as i64,
                privacy_notice_version,
                source,
                completed_at,
                created_at,
            ],
        )
        .map_err(|error| format!("failed to store dataset revision: {error}"))?
        == 1;
    transaction
        .query_row(
            "SELECT id, effective_sharing_level FROM dataset_revision
             WHERE dataset_id = ? AND metadata_sha256 = ?",
            params![dataset_id, metadata_sha256],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|error| format!("failed to reload dataset revision: {error}"))
        .and_then(|(id, level)| {
            Ok(RevisionUpsert {
                id,
                inserted,
                recorded_effective_level: level.parse()?,
            })
        })
}

fn queue_allowed_jobs(
    transaction: &Transaction<'_>,
    revision_id: &str,
    sharing_level: DatasetSharingLevel,
    now: &str,
) -> Result<(), String> {
    if sharing_level.allows_metadata() {
        insert_job(transaction, revision_id, "metadata", now)?;
    }
    if sharing_level.allows_full_dataset() {
        insert_job(transaction, revision_id, "full_dataset", now)?;
    }
    Ok(())
}

fn insert_job(
    transaction: &Transaction<'_>,
    revision_id: &str,
    kind: &str,
    now: &str,
) -> Result<(), String> {
    transaction
        .execute(
            "INSERT OR IGNORE INTO upload_job
             (id, dataset_revision_id, kind, state, attempt_count, bytes_uploaded, created_at, updated_at)
             VALUES (?, ?, ?, 'queued', 0, 0, ?, ?)",
            params![Uuid::now_v7().to_string(), revision_id, kind, now, now],
        )
        .map_err(|error| format!("failed to queue {kind} upload: {error}"))?;
    transaction
        .execute(
            "UPDATE upload_job SET state = 'queued', updated_at = ?, last_error = NULL
             WHERE dataset_revision_id = ? AND kind = ? AND state IN ('missing', 'cancelled')",
            params![now, revision_id, kind],
        )
        .map_err(|error| format!("failed to restore allowed {kind} upload: {error}"))?;
    Ok(())
}

fn cancel_jobs(
    transaction: &Transaction<'_>,
    kind: Option<&str>,
    now: &str,
    reason: &str,
) -> Result<(), String> {
    match kind {
        Some(kind) => transaction.execute(
            "UPDATE upload_job SET state = 'cancelled', updated_at = ?, last_error = ?
             WHERE kind = ? AND state IN ('queued', 'uploading', 'failed', 'missing')",
            params![now, reason, kind],
        ),
        None => transaction.execute(
            "UPDATE upload_job SET state = 'cancelled', updated_at = ?, last_error = ?
             WHERE state IN ('queued', 'uploading', 'failed', 'missing')",
            params![now, reason],
        ),
    }
    .map_err(|error| format!("failed to cancel disallowed upload jobs: {error}"))?;
    Ok(())
}

fn metadata_u64(metadata: &serde_json::Value, field: &str) -> u64 {
    metadata
        .get(field)
        .and_then(|value| value.as_u64())
        .unwrap_or(0)
}

fn count(connection: &Connection, statement: &str) -> Result<u64, String> {
    connection
        .query_row(statement, [], |row| row.get(0))
        .map_err(|error| format!("failed to load sync status: {error}"))
}

fn job_count(connection: &Connection, kind: &str, state: &str) -> Result<u64, String> {
    connection
        .query_row(
            "SELECT COUNT(*) FROM upload_job WHERE kind = ? AND state = ?",
            params![kind, state],
            |row| row.get(0),
        )
        .map_err(|error| format!("failed to load upload status: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn user_opt_out_overrides_admin_policy() {
        let mut database = test_database();
        assert!(!database.is_active().unwrap());
        assert_eq!(
            database.admin_policy().unwrap().level,
            DatasetSharingLevel::Metadata
        );

        database.set_user_sharing_enabled(true).unwrap();
        database
            .ingest_completion_event(&completed_event(true, "metadata-only"))
            .unwrap();
        let status = database.status().unwrap();
        assert_eq!(status.datasets, 1);
        assert_eq!(status.queued_metadata, 1);
        assert_eq!(status.queued_full_datasets, 0);

        database.set_user_sharing_enabled(false).unwrap();
        database
            .ingest_completion_event(&completed_event(true, "ignored"))
            .unwrap();
        let status = database.status().unwrap();
        assert!(!status.active);
        assert_eq!(status.datasets, 1);
        assert_eq!(status.queued_metadata, 0);
    }

    #[test]
    fn installation_id_is_stable_for_database() {
        let mut database = test_database();
        let first = database.installation_id().unwrap();
        let second = database.installation_id().unwrap();
        assert_eq!(first, second);
        assert!(first.starts_with("inst_"));

        database
            .adopt_installation_id("018f0f10-9a32-7c09-9234-123456789abc")
            .unwrap();
        assert_eq!(
            database.installation_id().unwrap(),
            "018f0f10-9a32-7c09-9234-123456789abc"
        );
    }

    #[test]
    fn newer_admin_policy_can_allow_all_without_overriding_opt_out() {
        let mut database = test_database();
        let policy = AdminDatasetPolicy {
            policy_id: "account-policy".to_string(),
            version: 1,
            level: DatasetSharingLevel::All,
            applies_to_existing: false,
            issued_at: Utc::now(),
        };
        assert!(database.apply_admin_policy(&policy).unwrap());
        assert_eq!(
            database.effective_sharing_level().unwrap(),
            DatasetSharingLevel::Nothing
        );
        database.set_user_sharing_enabled(true).unwrap();
        assert_eq!(
            database.effective_sharing_level().unwrap(),
            DatasetSharingLevel::All
        );
    }

    fn test_database() -> SyncDatabase {
        SyncDatabase::open(
            Path::new(":memory:"),
            Path::new("C:/datasets/lerobot/vulcan-studio"),
        )
        .unwrap()
    }

    fn completed_event(enabled: bool, name: &str) -> DatasetCompletedEvent {
        DatasetCompletedEvent::new(
            "robot-1",
            name,
            enabled,
            1,
            json!({
                "codebase_version": "3.0",
                "total_episodes": 3,
                "total_frames": 90
            }),
        )
        .unwrap()
    }
}
