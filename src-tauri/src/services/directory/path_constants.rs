use std::path::PathBuf;


pub const REMOTE_HOME_DIR: &str = "/home/sourccey";
pub const SOURCCEY_DESKTOP_ROOT: &str = "/home/sourccey/Desktop/Projects/sourccey-desktop";

/// Helper function to get remote home dir as PathBuf
#[allow(dead_code)]
pub fn get_remote_home_dir() -> PathBuf {
    PathBuf::from(REMOTE_HOME_DIR)
}

/// Helper function to get project root as PathBuf
pub fn get_project_root() -> PathBuf {
    PathBuf::from(SOURCCEY_DESKTOP_ROOT)
}

