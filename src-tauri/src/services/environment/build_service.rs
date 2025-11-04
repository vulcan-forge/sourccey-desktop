pub struct BuildService;

impl BuildService {
    /// Check if the application is running in development mode
    /// (executable is in target/debug or target/release)
    pub fn is_dev_mode() -> bool {
        println!("Checking if application is running in dev mode");
        if let Ok(exe_path) = std::env::current_exe() {
            println!("Executable path: {:?}", exe_path);
            if let Some(exe_dir) = exe_path.parent() {
                println!("Executable directory: {:?}", exe_dir);
                let exe_dir_str = exe_dir.to_string_lossy();
                println!("Executable directory string: {:?}", exe_dir_str);

                // Check for both forward slashes (Unix/Linux) and backslashes (Windows)
                let contains_debug = exe_dir_str.contains("target/debug") || exe_dir_str.contains("target\\debug");
                println!("Contains debug: {:?}", contains_debug);
                let contains_release = exe_dir_str.contains("target/release") || exe_dir_str.contains("target\\release");
                println!("Contains release: {:?}", contains_release);
                let result = contains_debug || contains_release;
                println!("Result: {:?}", result);
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
