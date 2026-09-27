use std::path::Path;
#[cfg(target_os = "windows")]
use std::process::Command;

#[cfg(target_os = "windows")]
const WINDOWS_RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(target_os = "windows")]
const WINDOWS_VALUE_NAME: &str = "SourcceySync";

pub fn install(executable: &Path) -> Result<(), String> {
    platform::install(executable)
}

pub fn uninstall() -> Result<(), String> {
    platform::uninstall()
}

pub fn is_installed() -> Result<bool, String> {
    platform::is_installed()
}

#[cfg(target_os = "windows")]
mod platform {
    use super::*;

    pub fn install(executable: &Path) -> Result<(), String> {
        let command = format!("\"{}\" run", executable.display());
        let status = Command::new("reg.exe")
            .args([
                "add",
                WINDOWS_RUN_KEY,
                "/v",
                WINDOWS_VALUE_NAME,
                "/t",
                "REG_SZ",
                "/d",
                &command,
                "/f",
            ])
            .status()
            .map_err(|error| format!("failed to register Sourccey Sync at login: {error}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("Windows startup registration failed with {status}"))
        }
    }

    pub fn uninstall() -> Result<(), String> {
        if !is_installed()? {
            return Ok(());
        }
        let status = Command::new("reg.exe")
            .args(["delete", WINDOWS_RUN_KEY, "/v", WINDOWS_VALUE_NAME, "/f"])
            .status()
            .map_err(|error| {
                format!("failed to remove Sourccey Sync startup registration: {error}")
            })?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("Windows startup removal failed with {status}"))
        }
    }

    pub fn is_installed() -> Result<bool, String> {
        let status = Command::new("reg.exe")
            .args(["query", WINDOWS_RUN_KEY, "/v", WINDOWS_VALUE_NAME])
            .status()
            .map_err(|error| {
                format!("failed to inspect Sourccey Sync startup registration: {error}")
            })?;
        Ok(status.success())
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::*;
    use std::fs;

    fn entry_path() -> Result<std::path::PathBuf, String> {
        dirs::config_dir()
            .map(|directory| directory.join("autostart").join("sourccey-sync.desktop"))
            .ok_or_else(|| "the operating system did not provide a config directory".to_string())
    }

    pub fn install(executable: &Path) -> Result<(), String> {
        let path = entry_path()?;
        let parent = path
            .parent()
            .ok_or_else(|| "invalid startup entry path".to_string())?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create autostart directory: {error}"))?;
        let executable = executable
            .to_string_lossy()
            .replace('\\', "\\\\")
            .replace('"', "\\\"");
        fs::write(
            &path,
            format!(
                "[Desktop Entry]\nType=Application\nName=Sourccey Sync\nExec=\"{executable}\" run\nTerminal=false\nX-GNOME-Autostart-enabled=true\n"
            ),
        )
        .map_err(|error| format!("failed to write autostart entry: {error}"))
    }

    pub fn uninstall() -> Result<(), String> {
        let path = entry_path()?;
        if path.exists() {
            fs::remove_file(path)
                .map_err(|error| format!("failed to remove autostart entry: {error}"))?;
        }
        Ok(())
    }

    pub fn is_installed() -> Result<bool, String> {
        Ok(entry_path()?.is_file())
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;

    pub fn install(_executable: &Path) -> Result<(), String> {
        Err("macOS startup registration must be performed by the signed desktop bundle through SMAppService".to_string())
    }

    pub fn uninstall() -> Result<(), String> {
        Err("macOS startup removal must be performed by the signed desktop bundle through SMAppService".to_string())
    }

    pub fn is_installed() -> Result<bool, String> {
        Ok(false)
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
mod platform {
    use super::*;

    pub fn install(_executable: &Path) -> Result<(), String> {
        Err("startup registration is not supported on this platform".to_string())
    }

    pub fn uninstall() -> Result<(), String> {
        Err("startup registration is not supported on this platform".to_string())
    }

    pub fn is_installed() -> Result<bool, String> {
        Ok(false)
    }
}
