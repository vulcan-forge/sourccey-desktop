use crate::services::directory::directory_service::DirectoryService;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const DEFAULT_LOCAL_KIOSK_APP_BASE_URL: &str = "http://192.168.1.220:3000";
pub const DEFAULT_LOCAL_KIOSK_API_BASE_URL: &str = "http://192.168.1.220:5200";
const PRODUCTION_APP_BASE_URL: &str = "https://studio.vulcanrobotics.ai";
const PRODUCTION_API_BASE_URL: &str = "https://api.studio.vulcanrobotics.ai";
const STAGING_APP_BASE_URL: &str = "https://staging.factory.studio.vulcanrobotics.ai";
const STAGING_API_BASE_URL: &str = "https://api.staging.factory.studio.vulcanrobotics.ai";

pub struct KioskEnvironmentService;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KioskEnvironment {
    Production,
    Staging,
    Local,
}

impl KioskEnvironment {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Production => "production",
            Self::Staging => "staging",
            Self::Local => "local",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Production => "Production",
            Self::Staging => "Staging",
            Self::Local => "Local",
        }
    }

    pub fn badge_label(self) -> Option<&'static str> {
        match self {
            Self::Production => None,
            Self::Staging => Some("Staging"),
            Self::Local => Some("Local"),
        }
    }

    pub fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "production" => Ok(Self::Production),
            "staging" => Ok(Self::Staging),
            "local" | "custom" => Ok(Self::Local),
            other => Err(format!("Unknown kiosk environment '{}'", other)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KioskEnvironmentSettings {
    pub environment: String,
    pub display_name: String,
    pub badge_label: Option<String>,
    pub custom_app_base_url: String,
    pub custom_api_base_url: String,
    pub app_base_url: String,
    pub api_base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveKioskEnvironmentSettingsRequest {
    pub environment: String,
    pub custom_app_base_url: Option<String>,
    pub custom_api_base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedKioskEnvironmentSettings {
    environment: String,
    #[serde(default)]
    custom_app_base_url: String,
    #[serde(default)]
    custom_api_base_url: String,
}

impl KioskEnvironmentService {
    pub fn default_settings() -> KioskEnvironmentSettings {
        Self::resolve_settings(
            KioskEnvironment::Local,
            DEFAULT_LOCAL_KIOSK_APP_BASE_URL.to_string(),
            DEFAULT_LOCAL_KIOSK_API_BASE_URL.to_string(),
        )
    }

    pub fn get_settings() -> Result<KioskEnvironmentSettings, String> {
        let path = Self::settings_file_path()?;
        if !path.exists() {
            return Ok(Self::default_settings());
        }

        let content = fs::read_to_string(&path).map_err(|e| {
            format!(
                "Failed to read kiosk environment settings {:?}: {}",
                path, e
            )
        })?;
        let persisted = serde_json::from_str::<PersistedKioskEnvironmentSettings>(&content)
            .map_err(|e| {
                format!(
                    "Failed to parse kiosk environment settings {:?}: {}",
                    path, e
                )
            })?;

        let environment = KioskEnvironment::parse(&persisted.environment)?;
        let (custom_app_base_url, custom_api_base_url) = match environment {
            KioskEnvironment::Local => Self::normalize_local_urls(
                Some(&persisted.custom_app_base_url),
                Some(&persisted.custom_api_base_url),
            )?,
            _ => (
                DEFAULT_LOCAL_KIOSK_APP_BASE_URL.to_string(),
                DEFAULT_LOCAL_KIOSK_API_BASE_URL.to_string(),
            ),
        };
        Ok(Self::resolve_settings(
            environment,
            custom_app_base_url,
            custom_api_base_url,
        ))
    }

    pub fn save_settings(
        request: SaveKioskEnvironmentSettingsRequest,
    ) -> Result<KioskEnvironmentSettings, String> {
        let environment = KioskEnvironment::parse(&request.environment)?;
        let (custom_app_base_url, custom_api_base_url) = match environment {
            KioskEnvironment::Local => Self::normalize_local_urls(
                request.custom_app_base_url.as_deref(),
                request.custom_api_base_url.as_deref(),
            )?,
            _ => (
                DEFAULT_LOCAL_KIOSK_APP_BASE_URL.to_string(),
                DEFAULT_LOCAL_KIOSK_API_BASE_URL.to_string(),
            ),
        };

        let payload = PersistedKioskEnvironmentSettings {
            environment: environment.as_str().to_string(),
            custom_app_base_url: custom_app_base_url.clone(),
            custom_api_base_url: custom_api_base_url.clone(),
        };

        let path = Self::settings_file_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create kiosk environment settings directory {:?}: {}",
                    parent, e
                )
            })?;
        }

        let serialized = serde_json::to_string_pretty(&payload)
            .map_err(|e| format!("Failed to encode kiosk environment settings: {}", e))?;
        fs::write(&path, serialized).map_err(|e| {
            format!(
                "Failed to write kiosk environment settings {:?}: {}",
                path, e
            )
        })?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o600);
            fs::set_permissions(&path, perms).map_err(|e| {
                format!(
                    "Failed to secure kiosk environment settings file {:?}: {}",
                    path, e
                )
            })?;
        }

        Ok(Self::resolve_settings(
            environment,
            custom_app_base_url,
            custom_api_base_url,
        ))
    }

    pub fn current_storage_key() -> Result<String, String> {
        let settings = Self::get_settings()?;
        Self::storage_key_for_settings(&settings)
    }

    pub fn storage_key_for_settings(settings: &KioskEnvironmentSettings) -> Result<String, String> {
        let environment = KioskEnvironment::parse(&settings.environment)?;
        match environment {
            KioskEnvironment::Production => Ok("production".to_string()),
            KioskEnvironment::Staging => Ok("staging".to_string()),
            KioskEnvironment::Local => {
                let normalized_app_base_url =
                    Self::normalize_base_url(&settings.custom_app_base_url)?;
                let normalized_api_base_url =
                    Self::normalize_base_url(&settings.custom_api_base_url)?;
                let app_key = Self::storage_url_segment(&normalized_app_base_url)?;
                let api_key = Self::storage_url_segment(&normalized_api_base_url)?;
                Ok(format!("local-app-{}-api-{}", app_key, api_key))
            }
        }
    }

    pub fn normalize_base_url(value: &str) -> Result<String, String> {
        let raw = value.trim();
        if raw.is_empty() {
            return Err("Base URL cannot be empty".to_string());
        }

        let with_scheme = if raw.contains("://") {
            raw.to_string()
        } else {
            format!("http://{}", raw)
        };

        let parsed =
            Url::parse(&with_scheme).map_err(|e| format!("Invalid base URL '{}': {}", raw, e))?;
        let scheme = parsed.scheme();
        if scheme != "http" && scheme != "https" {
            return Err("Base URL must use http or https".to_string());
        }

        let host = parsed
            .host_str()
            .ok_or("Base URL must include a host or IP address".to_string())?;
        let mut normalized = format!("{}://{}", scheme, host);
        if let Some(port) = parsed.port() {
            normalized.push(':');
            normalized.push_str(&port.to_string());
        }

        Ok(normalized)
    }

    fn resolve_settings(
        environment: KioskEnvironment,
        custom_app_base_url: String,
        custom_api_base_url: String,
    ) -> KioskEnvironmentSettings {
        let (app_base_url, api_base_url) = match environment {
            KioskEnvironment::Production => (
                PRODUCTION_APP_BASE_URL.to_string(),
                PRODUCTION_API_BASE_URL.to_string(),
            ),
            KioskEnvironment::Staging => (
                STAGING_APP_BASE_URL.to_string(),
                STAGING_API_BASE_URL.to_string(),
            ),
            KioskEnvironment::Local => (custom_app_base_url.clone(), custom_api_base_url.clone()),
        };

        KioskEnvironmentSettings {
            environment: environment.as_str().to_string(),
            display_name: environment.display_name().to_string(),
            badge_label: environment.badge_label().map(str::to_string),
            custom_app_base_url,
            custom_api_base_url,
            app_base_url,
            api_base_url,
        }
    }

    fn normalize_local_urls(
        app_value: Option<&str>,
        api_value: Option<&str>,
    ) -> Result<(String, String), String> {
        let custom_app_base_url = Self::normalize_base_url(
            app_value
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(DEFAULT_LOCAL_KIOSK_APP_BASE_URL),
        )?;
        let custom_api_base_url = Self::normalize_base_url(
            api_value
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(DEFAULT_LOCAL_KIOSK_API_BASE_URL),
        )?;
        Ok((custom_app_base_url, custom_api_base_url))
    }

    fn storage_url_segment(value: &str) -> Result<String, String> {
        let parsed = Url::parse(value)
            .map_err(|e| format!("Invalid local kiosk environment URL '{}': {}", value, e))?;
        let scheme = parsed.scheme().to_ascii_lowercase();
        let host = parsed
            .host_str()
            .ok_or("Local kiosk environment URL must include a host".to_string())?;
        let port = parsed
            .port_or_known_default()
            .ok_or("Local kiosk environment URL must include a port".to_string())?;
        Ok(format!(
            "{}-{}-{}",
            Self::slugify_storage_segment(&scheme),
            Self::slugify_storage_segment(host),
            port
        ))
    }

    fn slugify_storage_segment(value: &str) -> String {
        let mut slug = String::with_capacity(value.len());
        let mut last_was_dash = false;
        for ch in value.chars() {
            let normalized = if ch.is_ascii_alphanumeric() {
                Some(ch.to_ascii_lowercase())
            } else {
                None
            };

            if let Some(ch) = normalized {
                slug.push(ch);
                last_was_dash = false;
            } else if !last_was_dash {
                slug.push('-');
                last_was_dash = true;
            }
        }

        slug.trim_matches('-').to_string()
    }

    fn settings_file_path() -> Result<PathBuf, String> {
        let cache_dir = DirectoryService::get_lerobot_cache_dir()?;
        Ok(cache_dir.join("settings").join("kiosk_environment.json"))
    }
}

#[cfg(test)]
#[path = "tests/kiosk_environment_service_tests.rs"]
mod kiosk_environment_service_tests;
