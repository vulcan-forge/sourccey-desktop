use std::path::Path;

pub struct BuildService;

impl BuildService {
    /// Check if the application is running in development mode
    /// (the executable is directly in target/debug or target/release).
    ///
    /// Bundled applications are also produced below target/release, for example
    /// target/release/bundle/macos/App.app/Contents/MacOS/App. Those must be
    /// treated as production builds so their runtime is installed in the
    /// platform app-data directory rather than relative to the launch directory.
    pub fn is_dev_mode() -> bool {
        std::env::current_exe()
            .map(|path| Self::is_dev_executable_path(&path))
            .unwrap_or(false)
    }

    fn is_dev_executable_path(exe_path: &Path) -> bool {
        let Some(profile_dir) = exe_path.parent() else {
            return false;
        };
        let Some(target_dir) = profile_dir.parent() else {
            return false;
        };

        target_dir.file_name().is_some_and(|name| name == "target")
            && profile_dir
                .file_name()
                .is_some_and(|name| name == "debug" || name == "release")
    }

    /// Check if the application is running in production mode
    #[allow(dead_code)]
    pub fn is_production_mode() -> bool {
        !Self::is_dev_mode()
    }
}

#[cfg(test)]
mod tests {
    use super::BuildService;
    use std::path::Path;

    #[test]
    fn direct_cargo_targets_are_development_builds() {
        assert!(BuildService::is_dev_executable_path(Path::new(
            "/workspace/src-tauri/target/debug/VulcanStudio"
        )));
        assert!(BuildService::is_dev_executable_path(Path::new(
            "/workspace/src-tauri/target/release/VulcanStudio"
        )));
    }

    #[test]
    fn bundled_macos_executable_is_a_production_build() {
        assert!(!BuildService::is_dev_executable_path(Path::new(
            "/workspace/src-tauri/target/release/bundle/macos/Vulcan Studio.app/Contents/MacOS/VulcanStudio"
        )));
    }

    #[test]
    fn installed_executable_is_a_production_build() {
        assert!(!BuildService::is_dev_executable_path(Path::new(
            "/Applications/Vulcan Studio.app/Contents/MacOS/VulcanStudio"
        )));
    }
}
