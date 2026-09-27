use sourccey_sync_core::{SyncControlInbox, SyncInbox};
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct SyncPaths {
    pub root: PathBuf,
    pub database: PathBuf,
    pub lock: PathBuf,
    pub inbox: SyncInbox,
    pub control: SyncControlInbox,
    pub default_dataset_root: PathBuf,
}

impl SyncPaths {
    pub fn resolve() -> Result<Self, String> {
        let root = dirs::data_local_dir()
            .ok_or_else(|| {
                "the operating system did not provide a local data directory".to_string()
            })?
            .join("Sourccey")
            .join("Sync");
        Ok(Self {
            database: root.join("sync.sqlite3"),
            lock: root.join("sourccey-sync.lock"),
            inbox: SyncInbox::new(root.join("inbox")),
            control: SyncControlInbox::new(root.join("control")),
            default_dataset_root: resolve_default_dataset_root()?,
            root,
        })
    }

    pub fn ensure_directories(&self) -> Result<(), String> {
        std::fs::create_dir_all(&self.root)
            .map_err(|error| format!("failed to create sync data directory: {error}"))?;
        self.inbox
            .ensure_directories()
            .map_err(|error| format!("failed to create sync inbox: {error}"))?;
        self.control
            .ensure_directories()
            .map_err(|error| format!("failed to create sync control inbox: {error}"))
    }
}

fn resolve_default_dataset_root() -> Result<PathBuf, String> {
    if let Some(path) = nonempty_env_path("VULCAN_STUDIO_DATASET_ROOT") {
        return if path.is_absolute() {
            Ok(path)
        } else {
            Ok(resolve_lerobot_home()?.join(path))
        };
    }
    Ok(resolve_lerobot_home()?.join("vulcan-studio"))
}

fn resolve_lerobot_home() -> Result<PathBuf, String> {
    if let Some(path) = nonempty_env_path("HF_LEROBOT_HOME") {
        return Ok(path);
    }
    if let Some(path) = nonempty_env_path("HF_HOME") {
        return Ok(path.join("lerobot"));
    }
    dirs::home_dir()
        .map(|home| home.join(".cache").join("huggingface").join("lerobot"))
        .ok_or_else(|| "the operating system did not provide a home directory".to_string())
}

fn nonempty_env_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}
