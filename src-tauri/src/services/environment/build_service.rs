pub struct BuildService;

impl BuildService {
    /// Check if the application is running in development mode
    /// (executable is in target/debug or target/release)
    pub fn is_dev_mode() -> bool {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let exe_dir_str = exe_dir.to_string_lossy();

                // Check for both forward slashes (Unix/Linux) and backslashes (Windows)
                let contains_debug = exe_dir_str.contains("target/debug") || exe_dir_str.contains("target\\debug");
                let contains_release = exe_dir_str.contains("target/release") || exe_dir_str.contains("target\\release");
                let result = contains_debug || contains_release;
                return result;
            }
        }
        println!("Application is not running in dev mode");
        false
    }

    /// Check if the application is running in production mode
    #[allow(dead_code)]
    pub fn is_production_mode() -> bool {
        !Self::is_dev_mode()
    }
}
