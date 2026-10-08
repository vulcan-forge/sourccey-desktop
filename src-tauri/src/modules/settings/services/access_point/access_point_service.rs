use super::linux_access_point;
pub use super::linux_access_point::{AccessPointStatus, WiFiModeResult};
use crate::services::directory::directory_service::DirectoryService;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub struct AccessPointService;
// Shared with station connect/disconnect/scan so separate UI controls cannot
// issue conflicting NetworkManager operations on the robot's single adapter.
pub(crate) static NETWORK_MODE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessPointCredentials {
    pub ssid: String,
    pub password: String,
}

impl AccessPointService {
    fn require_linux() -> Result<(), String> {
        if cfg!(target_os = "linux") {
            Ok(())
        } else {
            Err("Robot access point control is only available on the Linux kiosk".into())
        }
    }

    pub async fn set_access_point(
        ssid: String,
        password: String,
    ) -> Result<AccessPointStatus, String> {
        Self::require_linux()?;
        linux_access_point::validate_credentials(&ssid, &password)?;
        let credentials_unchanged = Self::get_saved_access_point_credentials()?
            .is_some_and(|saved| saved.ssid == ssid && saved.password == password);
        let _guard = NETWORK_MODE_LOCK.lock().await;
        let saved_ssid = ssid.clone();
        let saved_password = password.clone();
        let status = tokio::task::spawn_blocking(move || {
            linux_access_point::enable(&ssid, &password, credentials_unchanged)
        })
        .await
        .map_err(|e| format!("Access point task failed: {e}"))??;
        Self::save_access_point_credentials(saved_ssid, saved_password)?;
        Ok(status)
    }

    pub async fn get_access_point_status() -> Result<AccessPointStatus, String> {
        Self::require_linux()?;
        tokio::task::spawn_blocking(linux_access_point::status)
            .await
            .map_err(|e| format!("Access point status task failed: {e}"))?
    }

    pub async fn is_access_point_active() -> Result<bool, String> {
        Ok(Self::get_access_point_status().await?.active)
    }

    pub async fn set_wifi_mode(ssid: String) -> Result<WiFiModeResult, String> {
        Self::require_linux()?;
        let _guard = NETWORK_MODE_LOCK.lock().await;
        tokio::task::spawn_blocking(move || linux_access_point::disable(&ssid))
            .await
            .map_err(|e| format!("Wi-Fi mode task failed: {e}"))?
    }

    pub fn get_saved_access_point_credentials() -> Result<Option<AccessPointCredentials>, String> {
        let path = Self::credentials_file_path()?;
        if !path.exists() {
            return Ok(None);
        }
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read access point credentials {path:?}: {e}"))?;
        let parsed = serde_json::from_str::<AccessPointCredentials>(&content)
            .map_err(|e| format!("Failed to parse access point credentials {path:?}: {e}"))?;
        linux_access_point::validate_credentials(&parsed.ssid, &parsed.password)?;
        Ok(Some(parsed))
    }

    pub fn save_access_point_credentials(ssid: String, password: String) -> Result<(), String> {
        linux_access_point::validate_credentials(&ssid, &password)?;
        let path = Self::credentials_file_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!("Failed to create access point credentials directory {parent:?}: {e}")
            })?;
        }
        let serialized = serde_json::to_string_pretty(&AccessPointCredentials { ssid, password })
            .map_err(|e| format!("Failed to encode access point credentials: {e}"))?;
        let mut options = fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&path)
            .map_err(|e| format!("Failed to open access point credentials {path:?}: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(fs::Permissions::from_mode(0o600))
                .map_err(|e| format!("Failed to secure access point credentials: {e}"))?;
        }
        use std::io::Write;
        file.write_all(serialized.as_bytes())
            .map_err(|e| format!("Failed to save access point credentials: {e}"))
    }

    fn credentials_file_path() -> Result<PathBuf, String> {
        Ok(DirectoryService::get_lerobot_cache_dir()?
            .join("settings")
            .join("access_point_credentials.json"))
    }
}
