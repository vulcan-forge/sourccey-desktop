use crate::modules::settings::services::kiosk_environment::kiosk_environment_service::{
    KioskEnvironmentService, KioskEnvironmentSettings,
};
use crate::services::directory::directory_service::DirectoryService;
use crate::services::log::log_service::LogService;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use uuid::Uuid;

const CLOUD_PAIRING_STATE_FILE_NAME: &str = "cloud_pairing_state.json";
const CLOUD_DEVICE_CREDENTIALS_FILE_NAME: &str = "cloud_device_credentials.json";
static KIOSK_APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
struct PersistedCloudPairingState {
    device_id: Option<String>,
    active_session_id: Option<String>,
    pairing_code: Option<String>,
    expires_at_ms: Option<u64>,
    owned_robot_id: Option<String>,
    claimed_at_ms: Option<u64>,
    status: Option<String>,
    #[serde(default)]
    api_base_url: Option<String>,
    #[serde(default)]
    portal_base_url: Option<String>,
    robot_model_name: Option<String>,
    device_auth_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PersistedCloudDeviceCredentials {
    version: u32,
    device_id: String,
    owned_robot_id: String,
    robot_model_name: Option<String>,
    relay_http_base_url: String,
    relay_ws_base_url: String,
    active_session_id: Option<String>,
    device_auth_token: String,
    claimed_at_ms: Option<u64>,
    saved_at_ms: u64,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KioskCloudPairingInfo {
    pub environment: String,
    pub portal_base_url: String,
    pub api_base_url: String,
    pub device_id: String,
    pub robot_model_name: String,
    pub pairing_code: Option<String>,
    pub expires_at_ms: Option<u64>,
    pub status: String,
    pub owned_robot_id: Option<String>,
    pub claimed_at_ms: Option<u64>,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct RelayBootstrapStartRequest {
    device_id: String,
    robot_model_name: String,
    default_nickname: Option<String>,
    agent_version: Option<String>,
    last_known_address: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct RelayBootstrapStartResponse {
    session_id: String,
    pairing_code: Option<String>,
    status: String,
    owned_robot_id: Option<String>,
    claimed_at_utc: Option<String>,
    device_auth_token: Option<String>,
    expires_at_utc: Option<String>,
    error: Option<RelayPairingError>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct RelayBootstrapStatusResponse {
    status: String,
    expires_at_utc: Option<String>,
    claimed_at_utc: Option<String>,
    owned_robot_id: Option<String>,
    device_auth_token: Option<String>,
    error: Option<RelayPairingError>,
}

#[derive(Debug, Deserialize)]
struct RelayPairingError {
    message: String,
    code: String,
}

#[derive(Clone)]
pub struct KioskPairingState {
    inner: Arc<Mutex<KioskPairingRuntimeState>>,
}

struct KioskPairingRuntimeState {
    nickname: String,
    robot_type: String,
}

pub struct KioskPairingService;

enum ClaimedCloudPairingValidation {
    Valid,
    Invalid,
    Unknown(String),
}

impl KioskPairingService {
    pub fn register_kiosk_runtime(app_handle: AppHandle) {
        if KIOSK_APP_HANDLE.set(app_handle).is_err() {
            // Already initialized; keep existing runtime handle.
        }
    }

    pub fn init_kiosk_pairing_state() -> KioskPairingState {
        KioskPairingState {
            inner: Arc::new(Mutex::new(KioskPairingRuntimeState {
                nickname: "sourccey".to_string(),
                robot_type: "sourccey".to_string(),
            })),
        }
    }

    pub fn get_kiosk_cloud_pairing_info(
        state: KioskPairingState,
    ) -> Result<KioskCloudPairingInfo, String> {
        Self::resolve_kiosk_cloud_pairing_info(state, true)
    }

    pub fn get_kiosk_cloud_pairing_status(
        state: KioskPairingState,
    ) -> Result<KioskCloudPairingInfo, String> {
        Self::resolve_kiosk_cloud_pairing_info(state, false)
    }

    fn resolve_kiosk_cloud_pairing_info(
        state: KioskPairingState,
        start_if_missing: bool,
    ) -> Result<KioskCloudPairingInfo, String> {
        let environment_settings = Self::cloud_environment_settings();
        let api_base_url = environment_settings.api_base_url.clone();
        let portal_base_url = environment_settings.app_base_url.clone();
        let mut persisted = Self::load_persisted_cloud_pairing_state().unwrap_or_default();

        let (robot_model_name, default_nickname) = {
            let runtime = state
                .inner
                .lock()
                .map_err(|_| "Failed to lock pairing state".to_string())?;
            (runtime.robot_type.clone(), runtime.nickname.clone())
        };

        let device_id = persisted
            .device_id
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| Uuid::now_v7().to_string());
        persisted.device_id = Some(device_id.clone());
        persisted.api_base_url = Some(api_base_url.clone());
        persisted.portal_base_url = Some(portal_base_url.clone());
        persisted.robot_model_name = Some(robot_model_name.clone());

        if persisted.status.as_deref() == Some("claimed") && persisted.owned_robot_id.is_some() {
            match Self::validate_claimed_cloud_pairing(&persisted) {
                ClaimedCloudPairingValidation::Valid => {
                    let _ = Self::save_persisted_cloud_pairing_state(&persisted);
                    let _ = Self::sync_cloud_device_credentials(&persisted);
                    return Ok(KioskCloudPairingInfo {
                        environment: environment_settings.environment.clone(),
                        portal_base_url: portal_base_url.clone(),
                        api_base_url: api_base_url.clone(),
                        device_id,
                        robot_model_name,
                        pairing_code: None,
                        expires_at_ms: None,
                        status: "claimed".to_string(),
                        owned_robot_id: persisted.owned_robot_id.clone(),
                        claimed_at_ms: persisted.claimed_at_ms,
                        error_message: None,
                    });
                }
                ClaimedCloudPairingValidation::Invalid => {
                    Self::reset_claimed_cloud_pairing_state(
                        &mut persisted,
                        &api_base_url,
                        &portal_base_url,
                        &robot_model_name,
                    );
                    let _ = Self::delete_cloud_device_credentials();
                    let _ = Self::save_persisted_cloud_pairing_state(&persisted);
                }
                ClaimedCloudPairingValidation::Unknown(error) => {
                    let _ = Self::save_persisted_cloud_pairing_state(&persisted);
                    let _ = Self::sync_cloud_device_credentials(&persisted);
                    return Ok(KioskCloudPairingInfo {
                        environment: environment_settings.environment.clone(),
                        portal_base_url: portal_base_url.clone(),
                        api_base_url: api_base_url.clone(),
                        device_id,
                        robot_model_name,
                        pairing_code: None,
                        expires_at_ms: None,
                        status: "claimed".to_string(),
                        owned_robot_id: persisted.owned_robot_id.clone(),
                        claimed_at_ms: persisted.claimed_at_ms,
                        error_message: Some(error),
                    });
                }
            }
        }

        if let Some(session_id) = persisted
            .active_session_id
            .clone()
            .filter(|value| !value.trim().is_empty())
        {
            match Self::fetch_cloud_bootstrap_status(&api_base_url, &session_id, &device_id) {
                Ok(status_response) => {
                    persisted.status = Some(status_response.status.clone());
                    persisted.owned_robot_id = status_response.owned_robot_id.clone();
                    persisted.device_auth_token = status_response.device_auth_token.clone();
                    persisted.claimed_at_ms = status_response
                        .claimed_at_utc
                        .as_deref()
                        .and_then(Self::parse_utc_to_ms);
                    persisted.expires_at_ms = status_response
                        .expires_at_utc
                        .as_deref()
                        .and_then(Self::parse_utc_to_ms);

                    if status_response.status == "claimed" {
                        persisted.pairing_code = None;
                    } else if status_response.status != "pending" {
                        persisted.active_session_id = None;
                        persisted.pairing_code = None;
                        persisted.expires_at_ms = None;
                    }

                    let _ = Self::save_persisted_cloud_pairing_state(&persisted);
                    let _ = Self::sync_cloud_device_credentials(&persisted);

                    if status_response.status == "pending" || status_response.status == "claimed" {
                        return Ok(KioskCloudPairingInfo {
                            environment: environment_settings.environment.clone(),
                            portal_base_url: portal_base_url.clone(),
                            api_base_url: api_base_url.clone(),
                            device_id,
                            robot_model_name,
                            pairing_code: persisted.pairing_code.clone(),
                            expires_at_ms: persisted.expires_at_ms,
                            status: status_response.status,
                            owned_robot_id: persisted.owned_robot_id.clone(),
                            claimed_at_ms: persisted.claimed_at_ms,
                            error_message: status_response
                                .error
                                .map(|error| format!("{} ({})", error.message, error.code)),
                        });
                    }
                }
                Err(error) => {
                    return Ok(KioskCloudPairingInfo {
                        environment: environment_settings.environment.clone(),
                        portal_base_url: portal_base_url.clone(),
                        api_base_url: api_base_url.clone(),
                        device_id,
                        robot_model_name,
                        pairing_code: persisted.pairing_code.clone(),
                        expires_at_ms: persisted.expires_at_ms,
                        status: persisted
                            .status
                            .clone()
                            .unwrap_or_else(|| "error".to_string()),
                        owned_robot_id: persisted.owned_robot_id.clone(),
                        claimed_at_ms: persisted.claimed_at_ms,
                        error_message: Some(error),
                    });
                }
            }
        }

        let _ = Self::save_persisted_cloud_pairing_state(&persisted);

        if !start_if_missing {
            return Ok(KioskCloudPairingInfo {
                environment: environment_settings.environment,
                portal_base_url,
                api_base_url,
                device_id,
                robot_model_name,
                pairing_code: None,
                expires_at_ms: None,
                status: "idle".to_string(),
                owned_robot_id: persisted.owned_robot_id.clone(),
                claimed_at_ms: persisted.claimed_at_ms,
                error_message: None,
            });
        }

        match Self::start_cloud_bootstrap(
            &api_base_url,
            &device_id,
            &robot_model_name,
            Some(default_nickname.as_str()),
            None,
            None,
        ) {
            Ok(start_response) => {
                persisted.active_session_id = if start_response.session_id.trim().is_empty() {
                    None
                } else {
                    Some(start_response.session_id.clone())
                };
                persisted.pairing_code = start_response.pairing_code.clone();
                persisted.expires_at_ms = start_response
                    .expires_at_utc
                    .as_deref()
                    .and_then(Self::parse_utc_to_ms);
                persisted.status = Some(start_response.status.clone());
                persisted.owned_robot_id = start_response.owned_robot_id.clone();
                persisted.device_auth_token = start_response.device_auth_token.clone();
                persisted.claimed_at_ms = start_response
                    .claimed_at_utc
                    .as_deref()
                    .and_then(Self::parse_utc_to_ms);

                if start_response.status == "claimed" {
                    persisted.pairing_code = None;
                }

                let _ = Self::save_persisted_cloud_pairing_state(&persisted);
                let _ = Self::sync_cloud_device_credentials(&persisted);

                Ok(KioskCloudPairingInfo {
                    environment: environment_settings.environment.clone(),
                    portal_base_url: portal_base_url.clone(),
                    api_base_url: api_base_url.clone(),
                    device_id,
                    robot_model_name,
                    pairing_code: persisted.pairing_code.clone(),
                    expires_at_ms: persisted.expires_at_ms,
                    status: start_response.status,
                    owned_robot_id: persisted.owned_robot_id.clone(),
                    claimed_at_ms: persisted.claimed_at_ms,
                    error_message: start_response
                        .error
                        .map(|error| format!("{} ({})", error.message, error.code)),
                })
            }
            Err(error) => Ok(KioskCloudPairingInfo {
                environment: environment_settings.environment,
                portal_base_url,
                api_base_url,
                device_id,
                robot_model_name,
                pairing_code: persisted.pairing_code.clone(),
                expires_at_ms: persisted.expires_at_ms,
                status: persisted
                    .status
                    .clone()
                    .unwrap_or_else(|| "error".to_string()),
                owned_robot_id: persisted.owned_robot_id.clone(),
                claimed_at_ms: persisted.claimed_at_ms,
                error_message: Some(error),
            }),
        }
    }

    pub fn should_refresh_cloud_pairing_before_host_start() -> Result<bool, String> {
        if Self::cloud_device_credentials_file_path()?.exists() {
            return Ok(false);
        }

        let persisted = Self::load_persisted_cloud_pairing_state().unwrap_or_default();

        let has_active_session = persisted
            .active_session_id
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| !value.is_empty());
        let has_pairing_code = persisted
            .pairing_code
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| !value.is_empty());
        let has_pending_status = matches!(persisted.status.as_deref(), Some("pending"));

        Ok(has_active_session || has_pairing_code || has_pending_status)
    }

    fn start_cloud_bootstrap(
        api_base_url: &str,
        device_id: &str,
        robot_model_name: &str,
        default_nickname: Option<&str>,
        agent_version: Option<&str>,
        last_known_address: Option<&str>,
    ) -> Result<RelayBootstrapStartResponse, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create relay bootstrap client: {}", e))?;

        let request = RelayBootstrapStartRequest {
            device_id: device_id.to_string(),
            robot_model_name: robot_model_name.to_string(),
            default_nickname: default_nickname
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            agent_version: agent_version
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            last_known_address: last_known_address
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
        };

        let response = client
            .post(format!("{}/api/v1/robot/bootstrap/start", api_base_url))
            .json(&request)
            .send()
            .map_err(|e| format!("Failed to start cloud pairing bootstrap: {}", e))?;

        if !response.status().is_success() {
            return Err(Self::format_http_error(
                "Relay bootstrap request failed",
                response,
            ));
        }

        response
            .json::<RelayBootstrapStartResponse>()
            .map_err(|e| format!("Failed to parse relay bootstrap response: {}", e))
    }

    fn fetch_cloud_bootstrap_status(
        api_base_url: &str,
        session_id: &str,
        device_id: &str,
    ) -> Result<RelayBootstrapStatusResponse, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create relay bootstrap status client: {}", e))?;

        let response = client
            .get(format!(
                "{}/api/v1/robot/bootstrap/{}?device_id={}",
                api_base_url, session_id, device_id
            ))
            .send()
            .map_err(|e| format!("Failed to fetch cloud pairing status: {}", e))?;

        if !response.status().is_success() {
            return Err(Self::format_http_error(
                "Relay bootstrap status request failed",
                response,
            ));
        }

        response
            .json::<RelayBootstrapStatusResponse>()
            .map_err(|e| format!("Failed to parse relay bootstrap status response: {}", e))
    }

    fn validate_claimed_cloud_pairing(
        state: &PersistedCloudPairingState,
    ) -> ClaimedCloudPairingValidation {
        let api_base_url = state
            .api_base_url
            .clone()
            .filter(|value| !value.trim().is_empty())
            .clone()
            .map(|value| value.trim().trim_end_matches('/').to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| Self::cloud_environment_settings().api_base_url);
        let Some(device_auth_token) = state
            .device_auth_token
            .clone()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        else {
            return ClaimedCloudPairingValidation::Invalid;
        };

        let client = match reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
        {
            Ok(client) => client,
            Err(error) => {
                return ClaimedCloudPairingValidation::Unknown(format!(
                    "Failed to create cloud pairing validation client: {}",
                    error
                ));
            }
        };

        let response = match client
            .get(format!("{}/api/v1/robot/session/active", api_base_url))
            .bearer_auth(device_auth_token)
            .send()
        {
            Ok(response) => response,
            Err(error) => {
                return ClaimedCloudPairingValidation::Unknown(format!(
                    "Failed to validate claimed cloud pairing: {}",
                    error
                ));
            }
        };

        match response.status() {
            reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN => {
                ClaimedCloudPairingValidation::Invalid
            }
            status if status.is_server_error() => ClaimedCloudPairingValidation::Unknown(format!(
                "Cloud pairing validation returned {}",
                status
            )),
            _ => ClaimedCloudPairingValidation::Valid,
        }
    }

    fn reset_claimed_cloud_pairing_state(
        state: &mut PersistedCloudPairingState,
        api_base_url: &str,
        portal_base_url: &str,
        robot_model_name: &str,
    ) {
        state.active_session_id = None;
        state.pairing_code = None;
        state.expires_at_ms = None;
        state.owned_robot_id = None;
        state.claimed_at_ms = None;
        state.status = None;
        state.api_base_url = Some(api_base_url.to_string());
        state.portal_base_url = Some(portal_base_url.to_string());
        state.robot_model_name = Some(robot_model_name.to_string());
        state.device_auth_token = None;
    }

    fn cloud_environment_settings() -> KioskEnvironmentSettings {
        KioskEnvironmentService::get_settings()
            .unwrap_or_else(|_| KioskEnvironmentService::default_settings())
    }

    fn parse_utc_to_ms(value: &str) -> Option<u64> {
        DateTime::parse_from_rfc3339(value)
            .ok()
            .and_then(|date_time| u64::try_from(date_time.timestamp_millis()).ok())
    }

    fn load_persisted_cloud_pairing_state() -> Result<PersistedCloudPairingState, String> {
        let state_path = Self::cloud_pairing_state_file_path()?;
        if !state_path.exists() {
            return Ok(PersistedCloudPairingState::default());
        }

        let content = fs::read_to_string(&state_path).map_err(|e| {
            format!(
                "Failed to read cloud pairing state file {:?}: {}",
                state_path, e
            )
        })?;
        serde_json::from_str::<PersistedCloudPairingState>(&content).map_err(|e| {
            format!(
                "Failed to parse cloud pairing state file {:?}: {}",
                state_path, e
            )
        })
    }

    fn save_persisted_cloud_pairing_state(
        state: &PersistedCloudPairingState,
    ) -> Result<(), String> {
        let state_path = Self::cloud_pairing_state_file_path()?;
        if let Some(parent) = state_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create cloud pairing state directory {:?}: {}",
                    parent, e
                )
            })?;
        }

        let serialized = serde_json::to_string_pretty(state)
            .map_err(|e| format!("Failed to encode cloud pairing state: {}", e))?;
        fs::write(&state_path, serialized).map_err(|e| {
            format!(
                "Failed to write cloud pairing state file {:?}: {}",
                state_path, e
            )
        })?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o600);
            fs::set_permissions(&state_path, perms).map_err(|e| {
                format!(
                    "Failed to secure cloud pairing state file {:?}: {}",
                    state_path, e
                )
            })?;
        }

        Ok(())
    }

    fn cloud_pairing_state_file_path() -> Result<std::path::PathBuf, String> {
        let pairing_dir = Self::current_cloud_pairing_dir_path()?;
        Ok(pairing_dir.join(CLOUD_PAIRING_STATE_FILE_NAME))
    }

    fn sync_cloud_device_credentials(state: &PersistedCloudPairingState) -> Result<(), String> {
        if state.status.as_deref() != Some("claimed") {
            return Ok(());
        }

        let payload = match Self::build_cloud_device_credentials(state) {
            Ok(payload) => payload,
            Err(message) => {
                Self::log_pairing_error(message);
                return Ok(());
            }
        };

        Self::save_cloud_device_credentials(&payload)
    }

    fn build_cloud_device_credentials(
        state: &PersistedCloudPairingState,
    ) -> Result<PersistedCloudDeviceCredentials, &'static str> {
        let Some(device_id) = state
            .device_id
            .clone()
            .filter(|value| !value.trim().is_empty())
        else {
            return Err(
                "Cloud pairing claim is missing device_id; skipping credential file update.",
            );
        };

        let Some(owned_robot_id) = state
            .owned_robot_id
            .clone()
            .filter(|value| !value.trim().is_empty())
        else {
            return Err(
                "Cloud pairing claim is missing owned_robot_id; skipping credential file update.",
            );
        };

        let Some(relay_http_base_url) = state
            .api_base_url
            .clone()
            .filter(|value| !value.trim().is_empty())
        else {
            return Err(
                "Cloud pairing claim is missing api_base_url; skipping credential file update.",
            );
        };

        let Some(device_auth_token) = state
            .device_auth_token
            .clone()
            .filter(|value| !value.trim().is_empty())
        else {
            return Err(
                "Cloud pairing claim is missing device_auth_token; skipping credential file update.",
            );
        };

        Ok(PersistedCloudDeviceCredentials {
            version: 1,
            device_id,
            owned_robot_id,
            robot_model_name: state.robot_model_name.clone(),
            relay_http_base_url: relay_http_base_url.clone(),
            relay_ws_base_url: Self::cloud_pairing_ws_base_url(&relay_http_base_url),
            active_session_id: state
                .active_session_id
                .clone()
                .filter(|value| !value.trim().is_empty()),
            device_auth_token,
            claimed_at_ms: state.claimed_at_ms,
            saved_at_ms: Self::now_ms(),
        })
    }

    fn save_cloud_device_credentials(
        credentials: &PersistedCloudDeviceCredentials,
    ) -> Result<(), String> {
        let credentials_path = Self::cloud_device_credentials_file_path()?;
        if let Some(parent) = credentials_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create cloud device credential directory {:?}: {}",
                    parent, e
                )
            })?;
        }

        let serialized = serde_json::to_string_pretty(credentials)
            .map_err(|e| format!("Failed to encode cloud device credentials: {}", e))?;
        fs::write(&credentials_path, serialized).map_err(|e| {
            format!(
                "Failed to write cloud device credentials file {:?}: {}",
                credentials_path, e
            )
        })?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o600);
            fs::set_permissions(&credentials_path, perms).map_err(|e| {
                format!(
                    "Failed to secure cloud device credentials file {:?}: {}",
                    credentials_path, e
                )
            })?;
        }

        Ok(())
    }

    fn delete_cloud_device_credentials() -> Result<(), String> {
        let credentials_path = Self::cloud_device_credentials_file_path()?;
        if !credentials_path.exists() {
            return Ok(());
        }

        fs::remove_file(&credentials_path).map_err(|e| {
            format!(
                "Failed to delete cloud device credentials file {:?}: {}",
                credentials_path, e
            )
        })
    }

    pub fn current_cloud_device_credentials_file_path() -> Result<std::path::PathBuf, String> {
        Self::cloud_device_credentials_file_path()
    }

    fn cloud_device_credentials_file_path() -> Result<std::path::PathBuf, String> {
        let pairing_dir = Self::current_cloud_pairing_dir_path()?;
        Ok(pairing_dir.join(CLOUD_DEVICE_CREDENTIALS_FILE_NAME))
    }

    fn cloud_pairing_ws_base_url(relay_http_base_url: &str) -> String {
        if let Some(suffix) = relay_http_base_url.strip_prefix("https://") {
            return format!("wss://{}", suffix);
        }
        if let Some(suffix) = relay_http_base_url.strip_prefix("http://") {
            return format!("ws://{}", suffix);
        }
        relay_http_base_url.to_string()
    }

    fn current_cloud_pairing_dir_path() -> Result<std::path::PathBuf, String> {
        let cache_dir = DirectoryService::get_lerobot_cache_dir()?;
        let storage_key = KioskEnvironmentService::current_storage_key()?;
        Ok(cache_dir.join("pairing").join(storage_key))
    }

    fn format_http_error(prefix: &str, response: reqwest::blocking::Response) -> String {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        let body = body.trim();
        if body.is_empty() {
            return format!("{} ({})", prefix, status);
        }

        let condensed = body.split_whitespace().collect::<Vec<_>>().join(" ");
        let truncated = if condensed.len() > 300 {
            format!("{}...", &condensed[..300])
        } else {
            condensed
        };
        format!("{} ({}): {}", prefix, status, truncated)
    }

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_else(|_| Duration::from_secs(0))
            .as_millis() as u64
    }

    fn log_pairing_error(message: &str) {
        if let Ok(path) = Self::pairing_log_path() {
            LogService::write_log_line(path.to_string_lossy().as_ref(), Some("pairing"), message);
        }
    }

    fn pairing_log_path() -> Result<std::path::PathBuf, String> {
        let base_dir = DirectoryService::get_current_dir()?;
        Ok(base_dir.join("logs").join("pairing.log"))
    }
}

#[cfg(test)]
mod tests {
    use super::{KioskPairingService, PersistedCloudPairingState};

    #[test]
    fn build_cloud_device_credentials_uses_api_origin_for_websocket_base_url() {
        let state = PersistedCloudPairingState {
            device_id: Some("device-123".to_string()),
            active_session_id: Some("session-456".to_string()),
            pairing_code: None,
            expires_at_ms: None,
            owned_robot_id: Some("robot-789".to_string()),
            claimed_at_ms: Some(123),
            status: Some("claimed".to_string()),
            api_base_url: Some("http://192.168.1.220:5200".to_string()),
            portal_base_url: Some("http://192.168.1.220:3000".to_string()),
            robot_model_name: Some("sourccey".to_string()),
            device_auth_token: Some("auth-token".to_string()),
        };

        let payload = KioskPairingService::build_cloud_device_credentials(&state)
            .expect("expected credentials payload");

        assert_eq!(payload.relay_http_base_url, "http://192.168.1.220:5200");
        assert_eq!(payload.relay_ws_base_url, "ws://192.168.1.220:5200");
    }
}
