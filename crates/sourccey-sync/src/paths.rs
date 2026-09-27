use sourccey_sync_core::SyncInbox;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct SyncPaths {
    pub root: PathBuf,
    pub database: PathBuf,
    pub lock: PathBuf,
    pub inbox: SyncInbox,
}

impl SyncPaths {
    pub fn resolve() -> Result<Self, String> {
        let root = match std::env::var_os("SOURCCEY_SYNC_DATA_DIR") {
            Some(path) if !path.is_empty() => PathBuf::from(path),
            _ => dirs::data_local_dir()
                .ok_or_else(|| {
                    "the operating system did not provide a local data directory".to_string()
                })?
                .join("Sourccey")
                .join("Sync"),
        };
        Ok(Self {
            database: root.join("sync.sqlite3"),
            lock: root.join("sourccey-sync.lock"),
            inbox: SyncInbox::new(root.join("inbox")),
            root,
        })
    }

    pub fn ensure_directories(&self) -> Result<(), String> {
        std::fs::create_dir_all(&self.root)
            .map_err(|error| format!("failed to create sync data directory: {error}"))?;
        self.inbox
            .ensure_directories()
            .map_err(|error| format!("failed to create sync inbox: {error}"))
    }
}
