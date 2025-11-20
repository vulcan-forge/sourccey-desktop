use std::path::PathBuf;
use crate::services::directory::path_constants;

pub struct RemoteDirectoryService;

impl RemoteDirectoryService {
    //------------------------------------------------------------//
    // Standard Directory Functions
    //------------------------------------------------------------//
    pub fn get_home_dir() -> Result<PathBuf, String> {
        Ok(path_constants::get_remote_home_dir())
    }

    pub fn get_sourccey_desktop_root() -> Result<PathBuf, String> {
        Ok(path_constants::get_project_root())
    }

    pub fn get_lerobot_vulcan_dir() -> Result<PathBuf, String> {
        let lerobot_vulcan_root = path_constants::get_lerobot_vulcan_root();
        Ok(lerobot_vulcan_root)
    }

    // Helper function to convert PathBuf to Linux-compatible string
    pub fn to_linux_path_string(path: &PathBuf) -> String {
        path.to_string_lossy().replace('\\', "/")
    }
}
