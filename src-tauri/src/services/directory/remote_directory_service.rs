use crate::services::directory::path_constants;
use std::path::PathBuf;

pub struct RemoteDirectoryService;

impl RemoteDirectoryService {
    //------------------------------------------------------------//
    // Standard Directory Functions
    //------------------------------------------------------------//
    #[allow(dead_code)]
    pub fn get_home_dir() -> Result<PathBuf, String> {
        Ok(path_constants::get_remote_home_dir())
    }
}
