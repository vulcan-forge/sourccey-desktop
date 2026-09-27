use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;
use sourccey_sync_core::{DatasetCompletedEvent, DatasetSharingLevel};
use std::path::Path;

pub struct SyncDatabase {
    connection: Connection,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub sharing_level: DatasetSharingLevel,
    pub datasets: u64,
    pub queued_metadata: u64,
    pub queued_full_datasets: u64,
    pub failed_jobs: u64,
}

impl SyncDatabase {
    pub fn open(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path)
            .map_err(|error| format!("failed to open sync database: {error}"))?;
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|error| format!("failed to configure sync database: {error}"))?;
        connection
            .execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA foreign_keys = ON;
                 CREATE TABLE IF NOT EXISTS sync_setting (
                    singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
                    sharing_level TEXT NOT NULL CHECK (sharing_level IN ('all', 'metadata', 'nothing')),
                    updated_at TEXT NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS dataset_record (
                    id TEXT PRIMARY KEY,
                    event_id TEXT NOT NULL UNIQUE,
                    robot_id TEXT NOT NULL,
                    repo_id TEXT NOT NULL,
                    local_path TEXT NOT NULL,
                    completed_at TEXT NOT NULL,
                    sharing_level_at_completion TEXT NOT NULL,
                    privacy_notice_version INTEGER NOT NULL,
                    metadata_json TEXT NOT NULL,
                    metadata_sha256 TEXT NOT NULL,
                    created_at TEXT NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS upload_job (
                    id TEXT PRIMARY KEY,
                    dataset_record_id TEXT NOT NULL,
                    kind TEXT NOT NULL CHECK (kind IN ('metadata', 'full_dataset')),
                    state TEXT NOT NULL CHECK (state IN ('queued', 'uploading', 'completed', 'failed', 'cancelled', 'missing')),
                    attempt_count INTEGER NOT NULL DEFAULT 0,
                    next_attempt_at TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(dataset_record_id, kind),
                    FOREIGN KEY(dataset_record_id) REFERENCES dataset_record(id) ON DELETE CASCADE
                 );
                 CREATE INDEX IF NOT EXISTS ix_upload_job_ready
                    ON upload_job(state, next_attempt_at, created_at);"
            )
            .map_err(|error| format!("failed to migrate sync database: {error}"))?;
        connection
            .execute(
                "INSERT OR IGNORE INTO sync_setting (singleton_key, sharing_level, updated_at)
                 VALUES (1, 'metadata', ?)",
                [Utc::now().to_rfc3339()],
            )
            .map_err(|error| format!("failed to initialize sync settings: {error}"))?;
        Ok(Self { connection })
    }

    pub fn sharing_level(&self) -> Result<DatasetSharingLevel, String> {
        let value: String = self
            .connection
            .query_row(
                "SELECT sharing_level FROM sync_setting WHERE singleton_key = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| format!("failed to load sharing level: {error}"))?;
        value.parse()
    }

    pub fn set_sharing_level(&mut self, level: DatasetSharingLevel) -> Result<(), String> {
        let transaction = self
            .connection
            .transaction()
            .map_err(|error| format!("failed to start policy update: {error}"))?;
        let now = Utc::now().to_rfc3339();
        transaction
            .execute(
                "UPDATE sync_setting SET sharing_level = ?, updated_at = ? WHERE singleton_key = 1",
                params![level.to_string(), now],
            )
            .map_err(|error| format!("failed to update sharing level: {error}"))?;

        match level {
            DatasetSharingLevel::All => {}
            DatasetSharingLevel::Metadata => {
                cancel_jobs(&transaction, Some("full_dataset"), &now)?;
            }
            DatasetSharingLevel::Nothing => {
                cancel_jobs(&transaction, None, &now)?;
            }
        }
        transaction
            .commit()
            .map_err(|error| format!("failed to commit policy update: {error}"))
    }

    pub fn ingest_completion_event(&mut self, event: &DatasetCompletedEvent) -> Result<(), String> {
        event.validate()?;
        let transaction = self
            .connection
            .transaction()
            .map_err(|error| format!("failed to start inbox transaction: {error}"))?;
        let current_level = load_sharing_level(&transaction)?;
        let effective_level = event.sharing_level_at_completion.intersect(current_level);
        let now = Utc::now().to_rfc3339();
        let metadata_json = serde_json::to_string(&event.metadata)
            .map_err(|error| format!("failed to serialize dataset metadata: {error}"))?;

        transaction
            .execute(
                "INSERT OR IGNORE INTO dataset_record
                 (id, event_id, robot_id, repo_id, local_path, completed_at,
                  sharing_level_at_completion, privacy_notice_version, metadata_json,
                  metadata_sha256, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    event.dataset_record_id.to_string(),
                    event.event_id.to_string(),
                    event.robot_id,
                    event.repo_id,
                    event.local_path.to_string_lossy(),
                    event.completed_at.to_rfc3339(),
                    event.sharing_level_at_completion.to_string(),
                    event.privacy_notice_version,
                    metadata_json,
                    event.metadata_sha256,
                    now,
                ],
            )
            .map_err(|error| format!("failed to store completed dataset: {error}"))?;

        if effective_level.allows_metadata() {
            insert_job(&transaction, event, "metadata", &now)?;
        }
        if effective_level.allows_full_dataset() {
            insert_job(&transaction, event, "full_dataset", &now)?;
        }

        transaction
            .commit()
            .map_err(|error| format!("failed to commit completed dataset: {error}"))
    }

    pub fn status(&self) -> Result<SyncStatus, String> {
        Ok(SyncStatus {
            sharing_level: self.sharing_level()?,
            datasets: count(&self.connection, "SELECT COUNT(*) FROM dataset_record")?,
            queued_metadata: count(
                &self.connection,
                "SELECT COUNT(*) FROM upload_job WHERE kind = 'metadata' AND state = 'queued'",
            )?,
            queued_full_datasets: count(
                &self.connection,
                "SELECT COUNT(*) FROM upload_job WHERE kind = 'full_dataset' AND state = 'queued'",
            )?,
            failed_jobs: count(
                &self.connection,
                "SELECT COUNT(*) FROM upload_job WHERE state = 'failed'",
            )?,
        })
    }
}

fn load_sharing_level(transaction: &Transaction<'_>) -> Result<DatasetSharingLevel, String> {
    let value: Option<String> = transaction
        .query_row(
            "SELECT sharing_level FROM sync_setting WHERE singleton_key = 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("failed to read sharing level: {error}"))?;
    value
        .ok_or_else(|| "sync sharing level is missing".to_string())?
        .parse()
}

fn insert_job(
    transaction: &Transaction<'_>,
    event: &DatasetCompletedEvent,
    kind: &str,
    now: &str,
) -> Result<(), String> {
    transaction
        .execute(
            "INSERT OR IGNORE INTO upload_job
             (id, dataset_record_id, kind, state, attempt_count, created_at, updated_at)
             VALUES (?, ?, ?, 'queued', 0, ?, ?)",
            params![
                uuid::Uuid::now_v7().to_string(),
                event.dataset_record_id.to_string(),
                kind,
                now,
                now,
            ],
        )
        .map_err(|error| format!("failed to queue {kind} upload: {error}"))?;
    Ok(())
}

fn cancel_jobs(transaction: &Transaction<'_>, kind: Option<&str>, now: &str) -> Result<(), String> {
    match kind {
        Some(kind) => transaction.execute(
            "UPDATE upload_job SET state = 'cancelled', updated_at = ?,
             last_error = 'Cancelled after sharing preference changed'
             WHERE kind = ? AND state IN ('queued', 'uploading', 'failed')",
            params![now, kind],
        ),
        None => transaction.execute(
            "UPDATE upload_job SET state = 'cancelled', updated_at = ?,
             last_error = 'Cancelled after sharing preference changed'
             WHERE state IN ('queued', 'uploading', 'failed')",
            [now],
        ),
    }
    .map_err(|error| format!("failed to cancel disallowed upload jobs: {error}"))?;
    Ok(())
}

fn count(connection: &Connection, statement: &str) -> Result<u64, String> {
    connection
        .query_row(statement, [], |row| row.get(0))
        .map_err(|error| format!("failed to load sync status: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use sourccey_sync_core::DatasetCompletedEvent;
    use std::path::{Path, PathBuf};

    #[test]
    fn current_policy_limits_jobs_created_from_completion_events() {
        let mut database = SyncDatabase::open(Path::new(":memory:")).unwrap();
        let metadata_default_event = completed_event(DatasetSharingLevel::All);
        database
            .ingest_completion_event(&metadata_default_event)
            .unwrap();
        let status = database.status().unwrap();
        assert_eq!(status.queued_metadata, 1);
        assert_eq!(status.queued_full_datasets, 0);

        database
            .set_sharing_level(DatasetSharingLevel::All)
            .unwrap();
        database
            .ingest_completion_event(&completed_event(DatasetSharingLevel::All))
            .unwrap();
        let status = database.status().unwrap();
        assert_eq!(status.queued_metadata, 2);
        assert_eq!(status.queued_full_datasets, 1);

        database
            .set_sharing_level(DatasetSharingLevel::Nothing)
            .unwrap();
        let status = database.status().unwrap();
        assert_eq!(status.queued_metadata, 0);
        assert_eq!(status.queued_full_datasets, 0);
    }

    fn completed_event(level: DatasetSharingLevel) -> DatasetCompletedEvent {
        DatasetCompletedEvent::new(
            "robot-1",
            format!("local/{}", uuid::Uuid::now_v7()),
            PathBuf::from("dataset"),
            level,
            1,
            json!({"totalEpisodes": 3}),
        )
        .unwrap()
    }
}
