use std::path::PathBuf;

// NOTE: This file uses merge=ours strategy to preserve local changes during merges
// THIS FILE SHOULD BE UPDATED PER REPO (Live vs Nightly)

/// Production project root path
/// This file uses merge=ours strategy to preserve local changes during merges
pub const PROJECT_ROOT: &str = "/home/sourccey/Desktop/Projects/sourccey-desktop";

/// Remote home directory path
pub const REMOTE_HOME_DIR: &str = "/home/sourccey";

/// Remote lerobot-vulcan directory name
pub const REMOTE_LEROBOT_VULCAN_DIR_NAME: &str = "lerobot-vulcan";

/// Helper function to get project root as PathBuf
pub fn get_project_root() -> PathBuf {
    PathBuf::from(PROJECT_ROOT)
}

/// Helper function to get remote home dir as PathBuf
pub fn get_remote_home_dir() -> PathBuf {
    PathBuf::from(REMOTE_HOME_DIR)
}
