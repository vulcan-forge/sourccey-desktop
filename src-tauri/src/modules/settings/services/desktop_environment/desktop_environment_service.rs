use crate::services::directory::directory_service::DirectoryService;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const PRODUCTION_GRAPHQL_API_URL: &str = "https://api.studio.vulcanrobotics.ai/graphql";
const PRODUCTION_ACCOUNT_SUMMARY_URL: &str =
    "https://api.studio.vulcanrobotics.ai/api/account-summary";
const PRODUCTION_AUTH_GOOGLE_URL: &str =
    "https://api.studio.vulcanrobotics.ai/api/v1/auth/google";
const PRODUCTION_AUTH_GITHUB_URL: &str =
    "https://api.studio.vulcanrobotics.ai/api/v1/auth/github";
const PRODUCTION_UPDATER_MANIFEST_URL: &str =
    "https://sourccey.nyc3.cdn.digitaloceanspaces.com/updater/latest.json";

const STAGING_GRAPHQL_API_URL: &str =
    "https://api.staging.factory.studio.vulcanrobotics.ai/graphql";
const STAGING_ACCOUNT_SUMMARY_URL: &str =
    "https://api.staging.factory.studio.vulcanrobotics.ai/api/account-summary";
const STAGING_AUTH_GOOGLE_URL: &str =
    "https://api.staging.factory.studio.vulcanrobotics.ai/api/v1/auth/google";
const STAGING_AUTH_GITHUB_URL: &str =
    "https://api.staging.factory.studio.vulcanrobotics.ai/api/v1/auth/github";
const STAGING_UPDATER_MANIFEST_URL: &str =
    "https://sourccey-staging.nyc3.cdn.digitaloceanspaces.com/updater/latest.json";

pub const DEFAULT_LOCAL_DESKTOP_GRAPHQL_API_URL: &str = "http://192.168.1.220:5200/graphql";
pub const DEFAULT_LOCAL_DESKTOP_ACCOUNT_SUMMARY_URL: &str =
    "http://192.168.1.220:5200/api/account-summary";
pub const DEFAULT_LOCAL_DESKTOP_AUTH_GOOGLE_URL: &str =
    "http://192.168.1.220:5200/api/v1/auth/google";
pub const DEFAULT_LOCAL_DESKTOP_AUTH_GITHUB_URL: &str =
    "http://192.168.1.220:5200/api/v1/auth/github";
pub const DEFAULT_LOCAL_DESKTOP_UPDATER_MANIFEST_URL: &str =
    "http://192.168.1.220:3000/latest.json";

pub struct DesktopEnvironmentService;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DesktopEnvironment {
    Production,
    Staging,
    Local,
}

impl DesktopEnvironment {
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
            Self::Local => "Developer",
        }
    }

    pub fn badge_label(self) -> Option<&'static str> {
        match self {
            Self::Production => None,
            Self::Staging => Some("STAGING"),
            Self::Local => Some("DEV MODE"),
        }
    }

    pub fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "production" => Ok(Self::Production),
            "staging" => Ok(Self::Staging),
            "local" | "developer" | "dev" | "custom" => Ok(Self::Local),
            other => Err(format!("Unknown desktop environment '{}'", other)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopEnvironmentSettings {
    pub environment: String,
    pub display_name: String,
    pub badge_label: Option<String>,
    pub custom_graphql_api_url: String,
    pub custom_account_summary_url: String,
    pub custom_auth_google_url: String,
    pub custom_auth_github_url: String,
    pub custom_updater_manifest_url: String,
    pub graphql_api_url: String,
    pub account_summary_url: String,
    pub auth_google_url: String,
    pub auth_github_url: String,
    pub updater_manifest_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDesktopEnvironmentSettingsRequest {
    pub environment: String,
    pub custom_graphql_api_url: Option<String>,
    pub custom_account_summary_url: Option<String>,
    pub custom_auth_google_url: Option<String>,
    pub custom_auth_github_url: Option<String>,
    pub custom_updater_manifest_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedDesktopEnvironmentSettings {
    environment: String,
    #[serde(default)]
    custom_graphql_api_url: String,
    #[serde(default)]
    custom_account_summary_url: String,
    #[serde(default)]
    custom_auth_google_url: String,
    #[serde(default)]
    custom_auth_github_url: String,
    #[serde(default)]
    custom_updater_manifest_url: String,
}

impl DesktopEnvironmentService {
    pub fn default_settings() -> DesktopEnvironmentSettings {
        Self::resolve_settings(
            DesktopEnvironment::Production,
            DEFAULT_LOCAL_DESKTOP_GRAPHQL_API_URL.to_string(),
            DEFAULT_LOCAL_DESKTOP_ACCOUNT_SUMMARY_URL.to_string(),
            DEFAULT_LOCAL_DESKTOP_AUTH_GOOGLE_URL.to_string(),
            DEFAULT_LOCAL_DESKTOP_AUTH_GITHUB_URL.to_string(),
            DEFAULT_LOCAL_DESKTOP_UPDATER_MANIFEST_URL.to_string(),
        )
    }

    pub fn get_settings() -> Result<DesktopEnvironmentSettings, String> {
        let path = Self::settings_file_path()?;
        Self::get_settings_from_path(&path)
    }

    pub fn save_settings(
        request: SaveDesktopEnvironmentSettingsRequest,
    ) -> Result<DesktopEnvironmentSettings, String> {
        let path = Self::settings_file_path()?;
        Self::save_settings_to_path(&path, request)
    }

    pub fn current_updater_manifest_url() -> Result<String, String> {
        Ok(Self::get_settings()?.updater_manifest_url)
    }

    fn get_settings_from_path(path: &Path) -> Result<DesktopEnvironmentSettings, String> {
        if !path.exists() {
            return Ok(Self::default_settings());
        }

        let content = fs::read_to_string(path).map_err(|e| {
            format!(
                "Failed to read desktop environment settings {:?}: {}",
                path, e
            )
        })?;
        let persisted = serde_json::from_str::<PersistedDesktopEnvironmentSettings>(&content)
            .map_err(|e| {
                format!(
                    "Failed to parse desktop environment settings {:?}: {}",
                    path, e
                )
            })?;

        let environment = DesktopEnvironment::parse(&persisted.environment)?;
        let (
            custom_graphql_api_url,
            custom_account_summary_url,
            custom_auth_google_url,
            custom_auth_github_url,
            custom_updater_manifest_url,
        ) = match environment {
            DesktopEnvironment::Local => Self::normalize_local_urls(
                Some(&persisted.custom_graphql_api_url),
                Some(&persisted.custom_account_summary_url),
                Some(&persisted.custom_auth_google_url),
                Some(&persisted.custom_auth_github_url),
                Some(&persisted.custom_updater_manifest_url),
            )?,
            _ => Self::default_local_urls(),
        };

        Ok(Self::resolve_settings(
            environment,
            custom_graphql_api_url,
            custom_account_summary_url,
            custom_auth_google_url,
            custom_auth_github_url,
            custom_updater_manifest_url,
        ))
    }

    fn save_settings_to_path(
        path: &Path,
        request: SaveDesktopEnvironmentSettingsRequest,
    ) -> Result<DesktopEnvironmentSettings, String> {
        let environment = DesktopEnvironment::parse(&request.environment)?;
        let (
            custom_graphql_api_url,
            custom_account_summary_url,
            custom_auth_google_url,
            custom_auth_github_url,
            custom_updater_manifest_url,
        ) = match environment {
            DesktopEnvironment::Local => Self::normalize_local_urls(
                request.custom_graphql_api_url.as_deref(),
                request.custom_account_summary_url.as_deref(),
                request.custom_auth_google_url.as_deref(),
                request.custom_auth_github_url.as_deref(),
                request.custom_updater_manifest_url.as_deref(),
            )?,
            _ => Self::default_local_urls(),
        };

        let payload = PersistedDesktopEnvironmentSettings {
            environment: environment.as_str().to_string(),
            custom_graphql_api_url: custom_graphql_api_url.clone(),
            custom_account_summary_url: custom_account_summary_url.clone(),
            custom_auth_google_url: custom_auth_google_url.clone(),
            custom_auth_github_url: custom_auth_github_url.clone(),
            custom_updater_manifest_url: custom_updater_manifest_url.clone(),
        };

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create desktop environment settings directory {:?}: {}",
                    parent, e
                )
            })?;
        }

        let serialized = serde_json::to_string_pretty(&payload)
            .map_err(|e| format!("Failed to encode desktop environment settings: {}", e))?;
        fs::write(path, serialized).map_err(|e| {
            format!(
                "Failed to write desktop environment settings {:?}: {}",
                path, e
            )
        })?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o600);
            fs::set_permissions(path, perms).map_err(|e| {
                format!(
                    "Failed to secure desktop environment settings file {:?}: {}",
                    path, e
                )
            })?;
        }

        Ok(Self::resolve_settings(
            environment,
            custom_graphql_api_url,
            custom_account_summary_url,
            custom_auth_google_url,
            custom_auth_github_url,
            custom_updater_manifest_url,
        ))
    }

    pub fn normalize_url(value: &str) -> Result<String, String> {
        let raw = value.trim();
        if raw.is_empty() {
            return Err("URL cannot be empty".to_string());
        }

        let with_scheme = if raw.contains("://") {
            raw.to_string()
        } else {
            format!("http://{}", raw)
        };

        let mut parsed =
            Url::parse(&with_scheme).map_err(|e| format!("Invalid URL '{}': {}", raw, e))?;
        let scheme = parsed.scheme();
        if scheme != "http" && scheme != "https" {
            return Err("URL must use http or https".to_string());
        }
        if parsed.host_str().is_none() {
            return Err("URL must include a host or IP address".to_string());
        }

        parsed.set_fragment(None);
        Ok(parsed.to_string().trim_end_matches('/').to_string())
    }

    fn default_local_urls() -> (String, String, String, String, String) {
        (
            DEFAULT_LOCAL_DESKTOP_GRAPHQL_API_URL.to_string(),
            DEFAULT_LOCAL_DESKTOP_ACCOUNT_SUMMARY_URL.to_string(),
            DEFAULT_LOCAL_DESKTOP_AUTH_GOOGLE_URL.to_string(),
            DEFAULT_LOCAL_DESKTOP_AUTH_GITHUB_URL.to_string(),
            DEFAULT_LOCAL_DESKTOP_UPDATER_MANIFEST_URL.to_string(),
        )
    }

    fn resolve_settings(
        environment: DesktopEnvironment,
        custom_graphql_api_url: String,
        custom_account_summary_url: String,
        custom_auth_google_url: String,
        custom_auth_github_url: String,
        custom_updater_manifest_url: String,
    ) -> DesktopEnvironmentSettings {
        let (
            graphql_api_url,
            account_summary_url,
            auth_google_url,
            auth_github_url,
            updater_manifest_url,
        ) = match environment {
            DesktopEnvironment::Production => (
                PRODUCTION_GRAPHQL_API_URL.to_string(),
                PRODUCTION_ACCOUNT_SUMMARY_URL.to_string(),
                PRODUCTION_AUTH_GOOGLE_URL.to_string(),
                PRODUCTION_AUTH_GITHUB_URL.to_string(),
                PRODUCTION_UPDATER_MANIFEST_URL.to_string(),
            ),
            DesktopEnvironment::Staging => (
                STAGING_GRAPHQL_API_URL.to_string(),
                STAGING_ACCOUNT_SUMMARY_URL.to_string(),
                STAGING_AUTH_GOOGLE_URL.to_string(),
                STAGING_AUTH_GITHUB_URL.to_string(),
                STAGING_UPDATER_MANIFEST_URL.to_string(),
            ),
            DesktopEnvironment::Local => (
                custom_graphql_api_url.clone(),
                custom_account_summary_url.clone(),
                custom_auth_google_url.clone(),
                custom_auth_github_url.clone(),
                custom_updater_manifest_url.clone(),
            ),
        };

        DesktopEnvironmentSettings {
            environment: environment.as_str().to_string(),
            display_name: environment.display_name().to_string(),
            badge_label: environment.badge_label().map(str::to_string),
            custom_graphql_api_url,
            custom_account_summary_url,
            custom_auth_google_url,
            custom_auth_github_url,
            custom_updater_manifest_url,
            graphql_api_url,
            account_summary_url,
            auth_google_url,
            auth_github_url,
            updater_manifest_url,
        }
    }

    fn normalize_local_urls(
        graphql_value: Option<&str>,
        account_summary_value: Option<&str>,
        auth_google_value: Option<&str>,
        auth_github_value: Option<&str>,
        updater_manifest_value: Option<&str>,
    ) -> Result<(String, String, String, String, String), String> {
        Ok((
            Self::normalize_url(
                graphql_value
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or(DEFAULT_LOCAL_DESKTOP_GRAPHQL_API_URL),
            )?,
            Self::normalize_url(
                account_summary_value
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or(DEFAULT_LOCAL_DESKTOP_ACCOUNT_SUMMARY_URL),
            )?,
            Self::normalize_url(
                auth_google_value
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or(DEFAULT_LOCAL_DESKTOP_AUTH_GOOGLE_URL),
            )?,
            Self::normalize_url(
                auth_github_value
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or(DEFAULT_LOCAL_DESKTOP_AUTH_GITHUB_URL),
            )?,
            Self::normalize_url(
                updater_manifest_value
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or(DEFAULT_LOCAL_DESKTOP_UPDATER_MANIFEST_URL),
            )?,
        ))
    }

    fn settings_file_path() -> Result<PathBuf, String> {
        let cache_dir = DirectoryService::get_lerobot_cache_dir()?;
        Ok(cache_dir.join("settings").join("desktop_environment.json"))
    }
}

#[cfg(test)]
#[path = "tests/desktop_environment_service_tests.rs"]
mod desktop_environment_service_tests;
