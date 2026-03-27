use std::path::PathBuf;
use crate::services::directory::path_constants;

pub struct RemoteDirectoryService;

impl RemoteDirectoryService {
    //------------------------------------------------------------//
    // Standard Directory Functions
    //------------------------------------------------------------//
    #[allow(dead_code)]
    pub fn get_home_dir() -> Result<PathBuf, String> {
        Ok(path_constants::get_remote_home_dir())
    }

    pub fn get_sourccey_desktop_root() -> Result<PathBuf, String> {
        Ok(path_constants::get_project_root())
    }
}
