use std::path::PathBuf;

pub struct RemoteDirectoryService;

impl RemoteDirectoryService {
    //------------------------------------------------------------//
    // Standard Directory Functions
    //------------------------------------------------------------//
    pub fn get_home_dir() -> Result<PathBuf, String> {
        Ok(PathBuf::from("/home/sourccey"))
    }

    pub fn get_lerobot_vulcan_dir() -> Result<PathBuf, String> {
        let home_directory = Self::get_home_dir()?;
        Ok(home_directory
            .join("Desktop")
            .join("Projects")
            .join("lerobot-vulcan-nightly"))
    }

    // Helper function to convert PathBuf to Linux-compatible string
    pub fn to_linux_path_string(path: &PathBuf) -> String {
        path.to_string_lossy().replace('\\', "/")
    }
}
