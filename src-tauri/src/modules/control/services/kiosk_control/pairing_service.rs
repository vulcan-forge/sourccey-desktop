use crate::services::directory::directory_service::DirectoryService;
use crate::services::log::log_service::LogService;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader, ErrorKind, Write};
use std::net::{IpAddr, Ipv4Addr, TcpListener, TcpStream, ToSocketAddrs, UdpSocket};
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

const DISCOVERY_MAGIC: &str = "SOURCCEY_DISCOVER_V1";
pub const DISCOVERY_PORT: u16 = 42111;
pub const DEFAULT_SERVICE_PORT: u16 = 42112;
const PAIRING_CODE_TTL_MS: u64 = 10 * 60 * 1000; // 10 minutes
const PAIRING_STATE_FILE_NAME: &str = "pairing_state.json";
const CLOUD_PAIRING_STATE_FILE_NAME: &str = "cloud_pairing_state.json";
const CLOUD_DEVICE_CREDENTIALS_FILE_NAME: &str = "cloud_device_credentials.json";
const DEFAULT_CLOUD_PAIRING_BASE_URL: &str = "http://192.168.1.220:5200";
static KIOSK_APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize, Default)]
struct PersistedPairingState {
    valid_tokens: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
struct PersistedCloudPairingState {
    device_id: Option<String>,
    active_session_id: Option<String>,
    pairing_code: Option<String>,
    expires_at_ms: Option<u64>,
    owned_robot_id: Option<String>,
    claimed_at_ms: Option<u64>,
    status: Option<String>,
    relay_base_url: Option<String>,
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
    device_auth_token: String,
    claimed_at_ms: Option<u64>,
    saved_at_ms: u64,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KioskPairingInfo {
    pub code: String,
    pub expires_at_ms: u64,
    pub service_port: u16,
    pub robot_name: String,
    pub nickname: String,
    pub robot_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KioskCloudPairingInfo {
    pub relay_base_url: String,
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
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveredKioskRobot {
    pub host: String,
    pub robot_name: String,
    pub nickname: String,
    pub robot_type: String,
    pub service_port: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PairWithKioskResult {
    pub token: String,
    pub robot_name: String,
    pub nickname: String,
    pub robot_type: String,
    pub service_port: u16,
}

#[derive(Debug, Serialize, Deserialize)]
struct KioskServiceRequest {
    action: String,
    code: Option<String>,
    token: Option<String>,
    client_name: Option<String>,
    repo_id: Option<String>,
    model_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct KioskServiceResponse {
    ok: bool,
    message: String,
    token: Option<String>,
    robot_name: Option<String>,
    nickname: Option<String>,
    robot_type: Option<String>,
    service_port: Option<u16>,
}

#[derive(Clone)]
pub struct KioskPairingState {
    inner: Arc<Mutex<KioskPairingRuntimeState>>,
}

struct KioskPairingRuntimeState {
    pairing_code: String,
    pairing_code_expires_at_ms: u64,
    valid_tokens: HashSet<String>,
    active_downloads: HashSet<String>,
    service_port: u16,
    robot_name: String,
    nickname: String,
    robot_type: String,
    servers_started: bool,
}

pub struct KioskPairingService;

impl KioskPairingService {
    pub fn register_kiosk_runtime(app_handle: AppHandle) {
        if KIOSK_APP_HANDLE.set(app_handle).is_err() {
            // Already initialized; keep existing runtime handle.
        }
    }

    pub fn init_kiosk_pairing_state() -> KioskPairingState {
        let persisted_tokens = Self::load_persisted_tokens().unwrap_or_else(|error| {
            eprintln!("Failed to load persisted pairing tokens: {}", error);
            HashSet::new()
        });

        KioskPairingState {
            inner: Arc::new(Mutex::new(KioskPairingRuntimeState {
                pairing_code: Self::generate_pairing_code(),
                pairing_code_expires_at_ms: Self::now_ms() + PAIRING_CODE_TTL_MS,
                valid_tokens: persisted_tokens,
                active_downloads: HashSet::new(),
                service_port: DEFAULT_SERVICE_PORT,
                robot_name: "Sourccey".to_string(),
                nickname: "sourccey".to_string(),
                robot_type: "sourccey".to_string(),
                servers_started: false,
            })),
        }
    }

    pub fn start_kiosk_pairing_network(state: KioskPairingState) -> Result<(), String> {
        {
            let mut runtime = state
                .inner
                .lock()
                .map_err(|_| "Failed to lock pairing state".to_string())?;
            if runtime.servers_started {
                return Ok(());
            }
            runtime.servers_started = true;
        }

        let discovery_socket = UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT))
            .map_err(|e| format!("Failed to bind pairing discovery socket: {}", e))?;
        discovery_socket
            .set_nonblocking(true)
            .map_err(|e| format!("Failed to set nonblocking on discovery socket: {}", e))?;

        let service_listener = TcpListener::bind(("0.0.0.0", DEFAULT_SERVICE_PORT))
            .map_err(|e| format!("Failed to bind pairing service socket: {}", e))?;
        service_listener
            .set_nonblocking(true)
            .map_err(|e| format!("Failed to set nonblocking on service socket: {}", e))?;

        let discovery_state = state.clone();
        thread::spawn(move || loop {
            let mut buf = [0_u8; 1024];
            match discovery_socket.recv_from(&mut buf) {
                Ok((size, src)) => {
                    let payload = String::from_utf8_lossy(&buf[..size]).trim().to_string();
                    if payload != DISCOVERY_MAGIC {
                        continue;
                    }

                    let info = match Self::get_kiosk_pairing_info(discovery_state.clone()) {
                        Ok(i) => i,
                        Err(e) => {
                            eprintln!("Failed to read pairing info for discovery: {}", e);
                            continue;
                        }
                    };

                    let announce = DiscoveredKioskRobot {
                        host: String::new(),
                        robot_name: info.robot_name,
                        nickname: info.nickname,
                        robot_type: info.robot_type,
                        service_port: info.service_port,
                    };

                    if let Ok(serialized) = serde_json::to_string(&announce) {
                        let _ = discovery_socket.send_to(serialized.as_bytes(), src);
                    }
                }
                Err(e) => {
                    if e.kind() != ErrorKind::WouldBlock {
                        eprintln!("Pairing discovery error: {}", e);
                    }
                    thread::sleep(Duration::from_millis(100));
                }
            }
        });

        let service_state = state.clone();
        thread::spawn(move || loop {
            match service_listener.accept() {
                Ok((stream, _)) => {
                    Self::handle_kiosk_service_client(stream, service_state.clone());
                }
                Err(e) => {
                    if e.kind() != ErrorKind::WouldBlock {
                        eprintln!("Pairing service accept error: {}", e);
                    }
                    thread::sleep(Duration::from_millis(50));
                }
            }
        });

        Ok(())
    }

    pub fn get_kiosk_pairing_info(state: KioskPairingState) -> Result<KioskPairingInfo, String> {
        let mut runtime = state
            .inner
            .lock()
            .map_err(|_| "Failed to lock pairing state".to_string())?;
        Self::refresh_pairing_code_if_needed(&mut runtime);

        Ok(KioskPairingInfo {
            code: runtime.pairing_code.clone(),
            expires_at_ms: runtime.pairing_code_expires_at_ms,
            service_port: runtime.service_port,
            robot_name: runtime.robot_name.clone(),
            nickname: runtime.nickname.clone(),
            robot_type: runtime.robot_type.clone(),
        })
    }

    pub fn get_kiosk_cloud_pairing_info(
        state: KioskPairingState,
    ) -> Result<KioskCloudPairingInfo, String> {
        let relay_base_url = Self::cloud_pairing_base_url();
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
        persisted.relay_base_url = Some(relay_base_url.clone());
        persisted.robot_model_name = Some(robot_model_name.clone());

        if persisted.status.as_deref() == Some("claimed") && persisted.owned_robot_id.is_some() {
            let _ = Self::save_persisted_cloud_pairing_state(&persisted);
            let _ = Self::sync_cloud_device_credentials(&persisted);
            return Ok(KioskCloudPairingInfo {
                relay_base_url,
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

        if let Some(session_id) = persisted
            .active_session_id
            .clone()
            .filter(|value| !value.trim().is_empty())
        {
            match Self::fetch_cloud_bootstrap_status(&relay_base_url, &session_id, &device_id) {
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
                            relay_base_url,
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
                        relay_base_url,
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

        match Self::start_cloud_bootstrap(
            &relay_base_url,
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
                    relay_base_url,
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
                relay_base_url,
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
    pub fn discover_pairable_robots(timeout_ms: u64) -> Result<Vec<DiscoveredKioskRobot>, String> {
        let socket = UdpSocket::bind(("0.0.0.0", 0))
            .map_err(|e| format!("Failed to bind discovery client socket: {}", e))?;
        socket
            .set_broadcast(true)
            .map_err(|e| format!("Failed to enable broadcast: {}", e))?;
        socket
            .set_read_timeout(Some(Duration::from_millis(250)))
            .map_err(|e| format!("Failed to set discovery timeout: {}", e))?;

        let broadcast_targets = Self::get_broadcast_targets();
        let mut send_attempts = 0;
        let mut last_send_at = Instant::now() - Duration::from_millis(500);

        let deadline = Instant::now() + Duration::from_millis(timeout_ms.max(300));
        let mut found: HashMap<String, DiscoveredKioskRobot> = HashMap::new();

        while Instant::now() < deadline {
            if send_attempts < 3 && last_send_at.elapsed() >= Duration::from_millis(200) {
                for target in &broadcast_targets {
                    let _ = socket.send_to(DISCOVERY_MAGIC.as_bytes(), (*target, DISCOVERY_PORT));
                }
                send_attempts += 1;
                last_send_at = Instant::now();
            }

            let mut buf = [0_u8; 1024];
            match socket.recv_from(&mut buf) {
                Ok((size, src)) => {
                    let payload = String::from_utf8_lossy(&buf[..size]).trim().to_string();
                    if let Ok(mut entry) = serde_json::from_str::<DiscoveredKioskRobot>(&payload) {
                        entry.host = src.ip().to_string();
                        found.insert(entry.host.clone(), entry);
                    }
                }
                Err(e) => {
                    if e.kind() != ErrorKind::WouldBlock && e.kind() != ErrorKind::TimedOut {
                        eprintln!("Discovery receive error: {}", e);
                    }
                }
            }
        }

        Ok(found.into_values().collect())
    }

    fn get_broadcast_targets() -> Vec<IpAddr> {
        let mut targets = vec![IpAddr::V4(Ipv4Addr::BROADCAST)];

        // Best-effort: derive a /24 broadcast from the local outbound IP.
        if let Ok(sock) = UdpSocket::bind(("0.0.0.0", 0)) {
            if sock.connect(("8.8.8.8", 80)).is_ok() {
                if let Ok(local_addr) = sock.local_addr() {
                    if let IpAddr::V4(local_ip) = local_addr.ip() {
                        let octets = local_ip.octets();
                        let subnet_broadcast = Ipv4Addr::new(octets[0], octets[1], octets[2], 255);
                        let subnet_ip = IpAddr::V4(subnet_broadcast);
                        if !targets.contains(&subnet_ip) {
                            targets.push(subnet_ip);
                        }
                    }
                }
            }
        }

        targets
    }

    pub fn pair_with_kiosk_robot(
        host: &str,
        code: &str,
        client_name: &str,
    ) -> Result<PairWithKioskResult, String> {
        let request = KioskServiceRequest {
            action: "pair".to_string(),
            code: Some(code.trim().to_string()),
            token: None,
            client_name: Some(client_name.to_string()),
            repo_id: None,
            model_name: None,
        };

        let response = Self::send_service_request(host, DEFAULT_SERVICE_PORT, &request)?;
        if !response.ok {
            let message = format!("Pairing rejected by robot {}: {}", host, response.message);
            Self::log_pairing_error(&message);
            return Err(response.message);
        }

        Ok(PairWithKioskResult {
            token: response
                .token
                .ok_or("Pairing response did not include token".to_string())?,
            robot_name: response
                .robot_name
                .unwrap_or_else(|| "Sourccey".to_string()),
            nickname: response.nickname.unwrap_or_else(|| "sourccey".to_string()),
            robot_type: response
                .robot_type
                .unwrap_or_else(|| "sourccey".to_string()),
            service_port: response.service_port.unwrap_or(DEFAULT_SERVICE_PORT),
        })
    }

    pub fn request_kiosk_pairing_modal(host: &str, port: u16) -> Result<String, String> {
        let request = KioskServiceRequest {
            action: "show_pairing".to_string(),
            code: None,
            token: None,
            client_name: Some("Desktop App".to_string()),
            repo_id: None,
            model_name: None,
        };

        let response = Self::send_service_request(host, port, &request)?;
        if !response.ok {
            return Err(response.message);
        }

        Ok(response.message)
    }

    pub fn send_model_to_kiosk_robot(
        host: &str,
        port: u16,
        token: &str,
        repo_id: &str,
        model_name: &str,
    ) -> Result<String, String> {
        let request = KioskServiceRequest {
            action: "download_model".to_string(),
            code: None,
            token: Some(token.to_string()),
            client_name: None,
            repo_id: Some(repo_id.to_string()),
            model_name: Some(model_name.to_string()),
        };

        let response = Self::send_service_request(host, port, &request)?;
        if !response.ok {
            return Err(response.message);
        }

        Ok(response.message)
    }

    pub fn check_kiosk_robot_connection(
        host: &str,
        port: u16,
        token: &str,
    ) -> Result<String, String> {
        let request = KioskServiceRequest {
            action: "ping".to_string(),
            code: None,
            token: Some(token.to_string()),
            client_name: None,
            repo_id: None,
            model_name: None,
        };

        let response = Self::send_service_request(host, port, &request)?;
        if !response.ok {
            return Err(response.message);
        }

        Ok(response.message)
    }

    pub fn start_kiosk_robot(host: &str, port: u16, token: &str) -> Result<String, String> {
        let request = KioskServiceRequest {
            action: "start_robot".to_string(),
            code: None,
            token: Some(token.to_string()),
            client_name: None,
            repo_id: None,
            model_name: None,
        };

        let response = Self::send_service_request(host, port, &request)?;
        if !response.ok {
            return Err(response.message);
        }

        Ok(response.message)
    }

    pub fn stop_kiosk_robot(host: &str, port: u16, token: &str) -> Result<String, String> {
        let request = KioskServiceRequest {
            action: "stop_robot".to_string(),
            code: None,
            token: Some(token.to_string()),
            client_name: None,
            repo_id: None,
            model_name: None,
        };

        let response = Self::send_service_request(host, port, &request)?;
        if !response.ok {
            return Err(response.message);
        }

        Ok(response.message)
    }

    pub fn get_kiosk_robot_status(host: &str, port: u16, token: &str) -> Result<String, String> {
        let request = KioskServiceRequest {
            action: "robot_status".to_string(),
            code: None,
            token: Some(token.to_string()),
            client_name: None,
            repo_id: None,
            model_name: None,
        };

        let response = Self::send_service_request(host, port, &request)?;
        if !response.ok {
            return Err(response.message);
        }

        Ok(response.message)
    }

    fn send_service_request(
        host: &str,
        port: u16,
        request: &KioskServiceRequest,
    ) -> Result<KioskServiceResponse, String> {
        let address = format!("{}:{}", host, port);
        let socket_addr = address
            .to_socket_addrs()
            .map_err(|e| {
                let message = format!("Failed to resolve robot address: {}", e);
                Self::log_pairing_error(&message);
                message
            })?
            .next()
            .ok_or_else(|| {
                let message = "No address found for robot host".to_string();
                Self::log_pairing_error(&message);
                message
            })?;

        let mut stream =
            TcpStream::connect_timeout(&socket_addr, Duration::from_secs(4)).map_err(|e| {
                let message = format!("Failed to connect to robot service: {}", e);
                Self::log_pairing_error(&message);
                message
            })?;
        stream
            .set_read_timeout(Some(Duration::from_secs(8)))
            .map_err(|e| {
                let message = format!("Failed to set read timeout: {}", e);
                Self::log_pairing_error(&message);
                message
            })?;
        stream
            .set_write_timeout(Some(Duration::from_secs(8)))
            .map_err(|e| {
                let message = format!("Failed to set write timeout: {}", e);
                Self::log_pairing_error(&message);
                message
            })?;

        let payload = format!(
            "{}\n",
            serde_json::to_string(request).map_err(|e| {
                let message = format!("Failed to encode request: {}", e);
                Self::log_pairing_error(&message);
                message
            })?
        );
        stream.write_all(payload.as_bytes()).map_err(|e| {
            let message = format!("Failed to send request to robot: {}", e);
            Self::log_pairing_error(&message);
            message
        })?;
        stream.flush().map_err(|e| {
            let message = format!("Failed to flush request: {}", e);
            Self::log_pairing_error(&message);
            message
        })?;

        let mut reader = BufReader::new(stream);
        let mut response_line = String::new();
        reader.read_line(&mut response_line).map_err(|e| {
            let message = format!("Failed to read response from robot: {}", e);
            Self::log_pairing_error(&message);
            message
        })?;

        if response_line.trim().is_empty() {
            let message = "Robot service returned empty response".to_string();
            Self::log_pairing_error(&message);
            return Err(message);
        }

        serde_json::from_str::<KioskServiceResponse>(response_line.trim()).map_err(|e| {
            let message = format!("Failed to parse robot response: {}", e);
            Self::log_pairing_error(&message);
            message
        })
    }

    fn handle_kiosk_service_client(mut stream: TcpStream, state: KioskPairingState) {
        let mut response = KioskServiceResponse {
            ok: false,
            message: "Invalid request".to_string(),
            token: None,
            robot_name: None,
            nickname: None,
            robot_type: None,
            service_port: Some(DEFAULT_SERVICE_PORT),
        };

        let mut request_line = String::new();
        let mut reader = match stream.try_clone() {
            Ok(clone) => BufReader::new(clone),
            Err(e) => {
                eprintln!("Failed to clone service stream: {}", e);
                return;
            }
        };

        if let Err(e) = reader.read_line(&mut request_line) {
            eprintln!("Failed to read service request: {}", e);
            return;
        }

        if let Ok(request) = serde_json::from_str::<KioskServiceRequest>(request_line.trim()) {
            response = match request.action.as_str() {
                "pair" => Self::handle_pair_request(state.clone(), request),
                "show_pairing" => Self::handle_show_pairing_request(state.clone(), request),
                "download_model" => Self::handle_download_model_request(state.clone(), request),
                "ping" => Self::handle_ping_request(state.clone(), request),
                "start_robot" => Self::handle_start_robot_request(state.clone(), request),
                "stop_robot" => Self::handle_stop_robot_request(state.clone(), request),
                "robot_status" => Self::handle_robot_status_request(state.clone(), request),
                _ => KioskServiceResponse {
                    ok: false,
                    message: "Unsupported action".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                },
            };
        }

        if let Ok(serialized) = serde_json::to_string(&response) {
            let _ = stream.write_all(format!("{}\n", serialized).as_bytes());
        }
    }

    fn handle_pair_request(
        state: KioskPairingState,
        request: KioskServiceRequest,
    ) -> KioskServiceResponse {
        let incoming_code = match request.code {
            Some(code) => code.trim().to_string(),
            None => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Missing pairing code".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                }
            }
        };

        let mut runtime = match state.inner.lock() {
            Ok(lock) => lock,
            Err(_) => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Failed to access pairing state".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                }
            }
        };

        Self::refresh_pairing_code_if_needed(&mut runtime);
        if runtime.pairing_code != incoming_code {
            return KioskServiceResponse {
                ok: false,
                message: "Invalid pairing code".to_string(),
                token: None,
                robot_name: None,
                nickname: None,
                robot_type: None,
                service_port: Some(runtime.service_port),
            };
        }

        let token = Uuid::now_v7().to_string();
        runtime.valid_tokens.insert(token.clone());
        if let Err(error) = Self::save_persisted_tokens(&runtime.valid_tokens) {
            eprintln!("Failed to persist pairing tokens: {}", error);
        }

        // One-time code: rotate immediately after successful pairing.
        runtime.pairing_code = Self::generate_pairing_code();
        runtime.pairing_code_expires_at_ms = Self::now_ms() + PAIRING_CODE_TTL_MS;

        if let Some(handle) = KIOSK_APP_HANDLE.get() {
            let _ = handle.emit(
                "kiosk-pairing-close",
                json!({ "source": "desktop_pairing" }),
            );
        }

        KioskServiceResponse {
            ok: true,
            message: "Pairing successful".to_string(),
            token: Some(token),
            robot_name: Some(runtime.robot_name.clone()),
            nickname: Some(runtime.nickname.clone()),
            robot_type: Some(runtime.robot_type.clone()),
            service_port: Some(runtime.service_port),
        }
    }

    fn handle_show_pairing_request(
        state: KioskPairingState,
        _request: KioskServiceRequest,
    ) -> KioskServiceResponse {
        let info = match Self::get_kiosk_pairing_info(state.clone()) {
            Ok(info) => info,
            Err(error) => {
                return KioskServiceResponse {
                    ok: false,
                    message: error,
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                }
            }
        };

        if let Some(handle) = KIOSK_APP_HANDLE.get() {
            let _ = handle.emit("kiosk-pairing-open", json!({ "source": "desktop_pairing" }));
        }

        KioskServiceResponse {
            ok: true,
            message: "Pairing modal opened".to_string(),
            token: None,
            robot_name: Some(info.robot_name),
            nickname: Some(info.nickname),
            robot_type: Some(info.robot_type),
            service_port: Some(info.service_port),
        }
    }

    fn handle_download_model_request(
        state: KioskPairingState,
        request: KioskServiceRequest,
    ) -> KioskServiceResponse {
        let token = match request.token {
            Some(token) => token,
            None => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Missing authentication token".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                }
            }
        };

        let repo_id = match request.repo_id {
            Some(repo_id) => repo_id,
            None => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Missing repo_id".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                }
            }
        };

        let model_name = match request.model_name {
            Some(name) => name,
            None => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Missing model_name".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                }
            }
        };

        let job_key = format!("{}/{}", repo_id, model_name);

        {
            let mut runtime = match state.inner.lock() {
                Ok(runtime) => runtime,
                Err(_) => {
                    return KioskServiceResponse {
                        ok: false,
                        message: "Failed to access pairing state".to_string(),
                        token: None,
                        robot_name: None,
                        nickname: None,
                        robot_type: None,
                        service_port: Some(DEFAULT_SERVICE_PORT),
                    }
                }
            };

            if !runtime.valid_tokens.contains(&token) {
                return KioskServiceResponse {
                    ok: false,
                    message: "Unauthorized request".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                };
            }

            if runtime.active_downloads.contains(&job_key) {
                return KioskServiceResponse {
                    ok: true,
                    message: "Model download already in progress on robot".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                };
            }

            runtime.active_downloads.insert(job_key.clone());
        }

        match Self::queue_model_download_request(&repo_id, &model_name) {
            Ok(_) => {
                Self::spawn_model_download_job(state.clone(), job_key, repo_id, model_name);
                KioskServiceResponse {
                    ok: true,
                    message: "Model download started on robot".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                }
            }
            Err(error) => {
                if let Ok(mut runtime) = state.inner.lock() {
                    runtime.active_downloads.remove(&job_key);
                }
                KioskServiceResponse {
                    ok: false,
                    message: error,
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                }
            }
        }
    }

    fn handle_ping_request(
        state: KioskPairingState,
        request: KioskServiceRequest,
    ) -> KioskServiceResponse {
        let token = match request.token {
            Some(token) => token,
            None => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Missing authentication token".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                }
            }
        };

        let is_valid_token = match state.inner.lock() {
            Ok(runtime) => runtime.valid_tokens.contains(&token),
            Err(_) => false,
        };

        if !is_valid_token {
            return KioskServiceResponse {
                ok: false,
                message: "Unauthorized request".to_string(),
                token: None,
                robot_name: None,
                nickname: None,
                robot_type: None,
                service_port: Some(DEFAULT_SERVICE_PORT),
            };
        }

        KioskServiceResponse {
            ok: true,
            message: "Robot reachable".to_string(),
            token: None,
            robot_name: None,
            nickname: None,
            robot_type: None,
            service_port: Some(DEFAULT_SERVICE_PORT),
        }
    }

    fn handle_start_robot_request(
        state: KioskPairingState,
        request: KioskServiceRequest,
    ) -> KioskServiceResponse {
        let token = match request.token {
            Some(token) => token,
            None => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Missing authentication token".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                }
            }
        };

        let nickname = match state.inner.lock() {
            Ok(runtime) => {
                if !runtime.valid_tokens.contains(&token) {
                    return KioskServiceResponse {
                        ok: false,
                        message: "Unauthorized request".to_string(),
                        token: None,
                        robot_name: None,
                        nickname: None,
                        robot_type: None,
                        service_port: Some(DEFAULT_SERVICE_PORT),
                    };
                }
                runtime.nickname.clone()
            }
            Err(_) => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Failed to access pairing state".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                };
            }
        };

        let app_handle = match KIOSK_APP_HANDLE.get() {
            Some(handle) => handle.clone(),
            None => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Kiosk runtime not initialized".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                };
            }
        };

        let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
        let db_connection = db_manager.get_connection().clone();
        let kiosk_host_state = app_handle.state::<
            crate::modules::control::services::kiosk_control::kiosk_host_service::KioskHostProcess,
        >();

        match tauri::async_runtime::block_on(
            crate::modules::control::services::kiosk_control::kiosk_host_service::KioskHostService::start_kiosk_host(
                app_handle.clone(),
                db_connection,
                &kiosk_host_state,
                nickname,
            ),
        ) {
            Ok(message) => KioskServiceResponse {
                ok: true,
                message,
                token: None,
                robot_name: None,
                nickname: None,
                robot_type: None,
                service_port: Some(DEFAULT_SERVICE_PORT),
            },
            Err(error) => KioskServiceResponse {
                ok: false,
                message: error,
                token: None,
                robot_name: None,
                nickname: None,
                robot_type: None,
                service_port: Some(DEFAULT_SERVICE_PORT),
            },
        }
    }

    fn handle_stop_robot_request(
        state: KioskPairingState,
        request: KioskServiceRequest,
    ) -> KioskServiceResponse {
        let token = match request.token {
            Some(token) => token,
            None => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Missing authentication token".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                }
            }
        };

        let nickname = match state.inner.lock() {
            Ok(runtime) => {
                if !runtime.valid_tokens.contains(&token) {
                    return KioskServiceResponse {
                        ok: false,
                        message: "Unauthorized request".to_string(),
                        token: None,
                        robot_name: None,
                        nickname: None,
                        robot_type: None,
                        service_port: Some(DEFAULT_SERVICE_PORT),
                    };
                }
                runtime.nickname.clone()
            }
            Err(_) => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Failed to access pairing state".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                };
            }
        };

        let app_handle = match KIOSK_APP_HANDLE.get() {
            Some(handle) => handle.clone(),
            None => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Kiosk runtime not initialized".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                };
            }
        };

        let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
        let db_connection = db_manager.get_connection().clone();
        let kiosk_host_state = app_handle.state::<
            crate::modules::control::services::kiosk_control::kiosk_host_service::KioskHostProcess,
        >();

        match crate::modules::control::services::kiosk_control::kiosk_host_service::KioskHostService::stop_kiosk_host(
            app_handle.clone(),
            db_connection,
            &kiosk_host_state,
            nickname,
        ) {
            Ok(message) => KioskServiceResponse {
                ok: true,
                message,
                token: None,
                robot_name: None,
                nickname: None,
                robot_type: None,
                service_port: Some(DEFAULT_SERVICE_PORT),
            },
            Err(error) => KioskServiceResponse {
                ok: false,
                message: error,
                token: None,
                robot_name: None,
                nickname: None,
                robot_type: None,
                service_port: Some(DEFAULT_SERVICE_PORT),
            },
        }
    }

    fn handle_robot_status_request(
        state: KioskPairingState,
        request: KioskServiceRequest,
    ) -> KioskServiceResponse {
        let token = match request.token {
            Some(token) => token,
            None => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Missing authentication token".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                }
            }
        };

        let nickname = match state.inner.lock() {
            Ok(runtime) => {
                if !runtime.valid_tokens.contains(&token) {
                    return KioskServiceResponse {
                        ok: false,
                        message: "Unauthorized request".to_string(),
                        token: None,
                        robot_name: None,
                        nickname: None,
                        robot_type: None,
                        service_port: Some(DEFAULT_SERVICE_PORT),
                    };
                }
                runtime.nickname.clone()
            }
            Err(_) => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Failed to access pairing state".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                };
            }
        };

        let app_handle = match KIOSK_APP_HANDLE.get() {
            Some(handle) => handle.clone(),
            None => {
                return KioskServiceResponse {
                    ok: false,
                    message: "Kiosk runtime not initialized".to_string(),
                    token: None,
                    robot_name: None,
                    nickname: None,
                    robot_type: None,
                    service_port: Some(DEFAULT_SERVICE_PORT),
                };
            }
        };

        let kiosk_host_state = app_handle.state::<
            crate::modules::control::services::kiosk_control::kiosk_host_service::KioskHostProcess,
        >();
        let is_started =
            crate::modules::control::services::kiosk_control::kiosk_host_service::KioskHostService::is_kiosk_host_active(
                &kiosk_host_state,
                nickname,
            );

        KioskServiceResponse {
            ok: true,
            message: if is_started {
                "started".to_string()
            } else {
                "stopped".to_string()
            },
            token: None,
            robot_name: None,
            nickname: None,
            robot_type: None,
            service_port: Some(DEFAULT_SERVICE_PORT),
        }
    }

    fn queue_model_download_request(repo_id: &str, model_name: &str) -> Result<String, String> {
        if !Self::is_safe_repo_id(repo_id) {
            return Err("Invalid repo_id".to_string());
        }
        if !Self::is_safe_model_name(model_name) {
            return Err("Invalid model_name".to_string());
        }

        let model_path = DirectoryService::get_lerobot_ai_model_path(repo_id, model_name)?;
        fs::create_dir_all(&model_path)
            .map_err(|e| format!("Failed to create model directory: {}", e))?;

        let request_path = model_path.join("download_request.json");
        let payload = json!({
            "repo_id": repo_id,
            "model_name": model_name,
            "requested_at_ms": Self::now_ms(),
            "status": "queued",
            "source": "desktop_pairing"
        });

        fs::write(
            request_path,
            serde_json::to_string_pretty(&payload)
                .map_err(|e| format!("Failed to encode request payload: {}", e))?,
        )
        .map_err(|e| format!("Failed to write download request: {}", e))?;

        Ok("Model download request queued on robot".to_string())
    }

    fn spawn_model_download_job(
        state: KioskPairingState,
        job_key: String,
        repo_id: String,
        model_name: String,
    ) {
        thread::spawn(move || {
            if let Err(e) =
                Self::update_download_request_status(&repo_id, &model_name, "downloading", None)
            {
                eprintln!("Failed to mark model as downloading: {}", e);
            }

            let result = Self::download_model_snapshot(&repo_id, &model_name);
            match result {
                Ok(_) => {
                    if let Err(e) = Self::update_download_request_status(
                        &repo_id,
                        &model_name,
                        "downloaded",
                        None,
                    ) {
                        eprintln!("Failed to mark model as downloaded: {}", e);
                    }
                }
                Err(error) => {
                    if let Err(e) = Self::update_download_request_status(
                        &repo_id,
                        &model_name,
                        "failed",
                        Some(&error),
                    ) {
                        eprintln!("Failed to mark model as failed: {}", e);
                    }
                    eprintln!(
                        "Model download failed ({} / {}): {}",
                        repo_id, model_name, error
                    );
                }
            }

            if let Ok(mut runtime) = state.inner.lock() {
                runtime.active_downloads.remove(&job_key);
            }
        });
    }

    fn download_model_snapshot(repo_id: &str, model_name: &str) -> Result<(), String> {
        let model_path = DirectoryService::get_lerobot_ai_model_path(repo_id, model_name)?;
        fs::create_dir_all(&model_path)
            .map_err(|e| format!("Failed to create model directory: {}", e))?;

        let python_path = DirectoryService::get_python_path()?;
        let downloader_script = r#"
import sys
from huggingface_hub import snapshot_download

repo_id = sys.argv[1]
local_dir = sys.argv[2]

snapshot_download(
    repo_id=repo_id,
    repo_type="model",
    local_dir=local_dir,
    local_dir_use_symlinks=False,
)
"#;

        let output = Command::new(python_path)
            .arg("-c")
            .arg(downloader_script)
            .arg(repo_id)
            .arg(model_path.to_string_lossy().to_string())
            .output()
            .map_err(|e| format!("Failed to launch model download process: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Err(if !stderr.is_empty() {
                stderr
            } else if !stdout.is_empty() {
                stdout
            } else {
                "Unknown model download error".to_string()
            });
        }

        Ok(())
    }

    fn update_download_request_status(
        repo_id: &str,
        model_name: &str,
        status: &str,
        error: Option<&str>,
    ) -> Result<(), String> {
        let model_path = DirectoryService::get_lerobot_ai_model_path(repo_id, model_name)?;
        fs::create_dir_all(&model_path)
            .map_err(|e| format!("Failed to create model directory: {}", e))?;

        let request_path = model_path.join("download_request.json");
        let mut payload = json!({
            "repo_id": repo_id,
            "model_name": model_name,
            "status": status,
            "source": "desktop_pairing",
            "updated_at_ms": Self::now_ms(),
        });

        if status == "downloaded" {
            payload["completed_at_ms"] = json!(Self::now_ms());
        }
        if let Some(err) = error {
            payload["error"] = json!(err);
        }

        fs::write(
            request_path,
            serde_json::to_string_pretty(&payload)
                .map_err(|e| format!("Failed to encode request payload: {}", e))?,
        )
        .map_err(|e| format!("Failed to write download request: {}", e))?;

        Ok(())
    }

    fn start_cloud_bootstrap(
        relay_base_url: &str,
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
            .post(format!("{}/api/v1/robot/bootstrap/start", relay_base_url))
            .json(&request)
            .send()
            .map_err(|e| format!("Failed to start cloud pairing bootstrap: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Relay bootstrap request failed ({})",
                response.status()
            ));
        }

        response
            .json::<RelayBootstrapStartResponse>()
            .map_err(|e| format!("Failed to parse relay bootstrap response: {}", e))
    }

    fn fetch_cloud_bootstrap_status(
        relay_base_url: &str,
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
                relay_base_url, session_id, device_id
            ))
            .send()
            .map_err(|e| format!("Failed to fetch cloud pairing status: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Relay bootstrap status request failed ({})",
                response.status()
            ));
        }

        response
            .json::<RelayBootstrapStatusResponse>()
            .map_err(|e| format!("Failed to parse relay bootstrap status response: {}", e))
    }

    fn cloud_pairing_base_url() -> String {
        std::env::var("VULCAN_CLOUD_PAIRING_BASE_URL")
            .ok()
            .map(|value| value.trim().trim_end_matches('/').to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| DEFAULT_CLOUD_PAIRING_BASE_URL.to_string())
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
        let cache_dir = DirectoryService::get_lerobot_cache_dir()?;
        Ok(cache_dir
            .join("pairing")
            .join(CLOUD_PAIRING_STATE_FILE_NAME))
    }

    fn sync_cloud_device_credentials(state: &PersistedCloudPairingState) -> Result<(), String> {
        if state.status.as_deref() != Some("claimed") {
            return Ok(());
        }

        let Some(device_id) = state
            .device_id
            .clone()
            .filter(|value| !value.trim().is_empty())
        else {
            Self::log_pairing_error(
                "Cloud pairing claim is missing device_id; skipping credential file update.",
            );
            return Ok(());
        };

        let Some(owned_robot_id) = state
            .owned_robot_id
            .clone()
            .filter(|value| !value.trim().is_empty())
        else {
            Self::log_pairing_error(
                "Cloud pairing claim is missing owned_robot_id; skipping credential file update.",
            );
            return Ok(());
        };

        let Some(relay_http_base_url) = state
            .relay_base_url
            .clone()
            .filter(|value| !value.trim().is_empty())
        else {
            Self::log_pairing_error(
                "Cloud pairing claim is missing relay_base_url; skipping credential file update.",
            );
            return Ok(());
        };

        let Some(device_auth_token) = state
            .device_auth_token
            .clone()
            .filter(|value| !value.trim().is_empty())
        else {
            Self::log_pairing_error("Cloud pairing claim is missing device_auth_token; skipping credential file update.");
            return Ok(());
        };

        let payload = PersistedCloudDeviceCredentials {
            version: 1,
            device_id,
            owned_robot_id,
            robot_model_name: state.robot_model_name.clone(),
            relay_http_base_url: relay_http_base_url.clone(),
            relay_ws_base_url: Self::cloud_pairing_ws_base_url(&relay_http_base_url),
            device_auth_token,
            claimed_at_ms: state.claimed_at_ms,
            saved_at_ms: Self::now_ms(),
        };

        Self::save_cloud_device_credentials(&payload)
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

    fn cloud_device_credentials_file_path() -> Result<std::path::PathBuf, String> {
        let cache_dir = DirectoryService::get_lerobot_cache_dir()?;
        Ok(cache_dir
            .join("pairing")
            .join(CLOUD_DEVICE_CREDENTIALS_FILE_NAME))
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
    fn refresh_pairing_code_if_needed(runtime: &mut KioskPairingRuntimeState) {
        if Self::now_ms() >= runtime.pairing_code_expires_at_ms {
            runtime.pairing_code = Self::generate_pairing_code();
            runtime.pairing_code_expires_at_ms = Self::now_ms() + PAIRING_CODE_TTL_MS;
        }
    }

    fn generate_pairing_code() -> String {
        let raw = Uuid::now_v7().as_u128() % 1_000_000;
        format!("{:06}", raw)
    }

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_else(|_| Duration::from_secs(0))
            .as_millis() as u64
    }

    fn is_safe_repo_id(value: &str) -> bool {
        if value.trim().is_empty()
            || value.starts_with('/')
            || value.contains('\\')
            || value.contains("..")
        {
            return false;
        }
        value.chars().all(|ch| {
            ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.' || ch == '/'
        })
    }

    fn is_safe_model_name(value: &str) -> bool {
        if value.trim().is_empty()
            || value.starts_with('/')
            || value.contains('\\')
            || value.contains("..")
            || value.contains('/')
        {
            return false;
        }
        value.chars().all(|ch| {
            ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.' || ch == ' '
        })
    }

    fn load_persisted_tokens() -> Result<HashSet<String>, String> {
        let state_path = Self::pairing_state_file_path()?;
        if !state_path.exists() {
            return Ok(HashSet::new());
        }

        let content = fs::read_to_string(&state_path)
            .map_err(|e| format!("Failed to read pairing state file {:?}: {}", state_path, e))?;
        let persisted = serde_json::from_str::<PersistedPairingState>(&content)
            .map_err(|e| format!("Failed to parse pairing state file {:?}: {}", state_path, e))?;

        Ok(persisted
            .valid_tokens
            .into_iter()
            .filter(|token| !token.trim().is_empty())
            .collect())
    }

    fn save_persisted_tokens(valid_tokens: &HashSet<String>) -> Result<(), String> {
        let state_path = Self::pairing_state_file_path()?;
        if let Some(parent) = state_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create pairing state directory {:?}: {}",
                    parent, e
                )
            })?;
        }

        let payload = PersistedPairingState {
            valid_tokens: valid_tokens.iter().cloned().collect(),
        };
        let serialized = serde_json::to_string_pretty(&payload)
            .map_err(|e| format!("Failed to encode pairing state: {}", e))?;

        fs::write(&state_path, serialized)
            .map_err(|e| format!("Failed to write pairing state file {:?}: {}", state_path, e))?;
        Ok(())
    }

    fn pairing_state_file_path() -> Result<std::path::PathBuf, String> {
        let cache_dir = DirectoryService::get_lerobot_cache_dir()?;
        Ok(cache_dir.join("pairing").join(PAIRING_STATE_FILE_NAME))
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
