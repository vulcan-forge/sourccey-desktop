use crate::services::directory::directory_service::DirectoryService;
use crate::services::log::log_service::LogService;
use crate::services::process::process_service::ProcessService;
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::net::UdpSocket;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

pub const MANUAL_DRIVE_UDP_PORT: u16 = 5561;
const ALLOWED_KEYS: [&str; 12] = ["a", "d", "e", "f", "m", "n", "q", "r", "s", "w", "x", "z"];

struct ManualDriveProcessEntry {
    child: CommandChild,
    shutdown_flag: Arc<AtomicBool>,
    udp_port: u16,
}

#[derive(Clone)]
pub struct KioskManualDriveProcess(
    Arc<Mutex<HashMap<String, ManualDriveProcessEntry>>>,
);

pub struct KioskManualDriveService;

#[derive(Serialize)]
struct ManualDriveControlPacket {
    nickname: String,
    pressed_keys: Vec<String>,
    sent_at_ms: u64,
}

impl KioskManualDriveService {
    pub fn init_kiosk_manual_drive() -> KioskManualDriveProcess {
        KioskManualDriveProcess(Arc::new(Mutex::new(HashMap::new())))
    }

    pub async fn start_kiosk_manual_drive(
        app_handle: AppHandle,
        state: &KioskManualDriveProcess,
        nickname: String,
    ) -> Result<String, String> {
        let normalized_nickname = Self::normalize_nickname(&nickname)?;

        {
            let processes = state.0.lock().unwrap();
            if processes.contains_key(&normalized_nickname) {
                return Ok(format!(
                    "Manual drive bridge already running for nickname: {}",
                    normalized_nickname
                ));
            }
        }

        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;

        if !lerobot_dir.exists() {
            return Err(format!(
                "LeRobot directory not found at: {:?}",
                lerobot_dir
            ));
        }
        if !python_path.exists() {
            return Err(format!(
                "Python executable not found at: {:?}",
                python_path
            ));
        }

        let udp_port = Self::find_available_udp_port()?;
        let command_parts = Self::build_command_args(&normalized_nickname, udp_port);
        let envs = Self::build_envs()?;
        let lerobot_dir_str = lerobot_dir.to_string_lossy().to_string();
        let python_path_str = python_path.to_string_lossy().to_string();

        let cmd = app_handle
            .shell()
            .command(python_path_str)
            .args(command_parts[1..].iter())
            .current_dir(lerobot_dir_str)
            .envs(envs);

        let (mut rx, child) = cmd
            .spawn()
            .map_err(|e| format!("Failed to start kiosk manual drive bridge: {}", e))?;

        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let pid = child.pid();
        let nickname_for_logs = normalized_nickname.clone();
        let app_handle_for_logs = app_handle.clone();
        let shutdown_for_logs = shutdown_flag.clone();
        let manual_drive_log_path = Self::manual_drive_log_path()
            .ok()
            .map(|p| p.to_string_lossy().to_string());

        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                if shutdown_for_logs.load(Ordering::Relaxed) {
                    break;
                }

                match event {
                    CommandEvent::Stdout(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes).trim().to_string();
                        if !line.is_empty() {
                            let formatted = format!("[{}] MANUAL {}", nickname_for_logs, line);
                            let _ = app_handle_for_logs.emit("kiosk-host-log", formatted.clone());
                            if let Some(path) = &manual_drive_log_path {
                                LogService::write_log_line(path, Some("manual-drive"), &formatted);
                            }
                        }
                    }
                    CommandEvent::Stderr(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes).trim().to_string();
                        if !line.is_empty() {
                            let formatted = format!("[{}] MANUAL-ERR {}", nickname_for_logs, line);
                            let _ = app_handle_for_logs.emit("kiosk-host-log", formatted.clone());
                            if let Some(path) = &manual_drive_log_path {
                                LogService::write_log_line(path, Some("manual-drive"), &formatted);
                            }
                        }
                    }
                    CommandEvent::Error(err) => {
                        let formatted = format!("[{}] MANUAL-ERR {}", nickname_for_logs, err);
                        let _ = app_handle_for_logs.emit("kiosk-host-log", formatted.clone());
                        if let Some(path) = &manual_drive_log_path {
                            LogService::write_log_line(path, Some("manual-drive"), &formatted);
                        }
                    }
                    _ => {}
                }
            }
        });

        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        if !ProcessService::is_process_alive(&app_handle, pid) {
            shutdown_flag.store(true, Ordering::Relaxed);
            let hint = Self::manual_drive_log_path()
                .ok()
                .map(|p| p.to_string_lossy().to_string())
                .map(|p| format!(" Check logs at {}", p))
                .unwrap_or_default();
            return Err(format!(
                "Manual drive bridge exited immediately after start.{}",
                hint
            ));
        }

        state
            .0
            .lock()
            .unwrap()
            .insert(
                normalized_nickname.clone(),
                ManualDriveProcessEntry {
                    child,
                    shutdown_flag: shutdown_flag.clone(),
                    udp_port,
                },
            );

        let state_for_shutdown = state.0.clone();
        let process_key = normalized_nickname.clone();
        let app_for_shutdown = app_handle.clone();
        let shutdown_metadata = json!({
            "nickname": normalized_nickname,
            "exit_code": null,
            "message": "Manual drive bridge process exited unexpectedly",
        });
        ProcessService::start_process_monitor(
            pid,
            app_handle,
            shutdown_flag,
            "kiosk-manual-drive-shutdown".to_string(),
            shutdown_metadata,
            1,
            1000,
            Some(Box::new(move || {
                let _ = state_for_shutdown.lock().unwrap().remove(&process_key);
                let _ = app_for_shutdown.emit(
                    "kiosk-host-log",
                    format!("[{}] MANUAL bridge process stopped", process_key),
                );
            })),
        );

        Self::send_control_packet(&normalized_nickname, Vec::new(), udp_port)?;

        Ok(format!(
            "Manual drive bridge started for nickname: {}",
            normalized_nickname
        ))
    }

    pub fn set_kiosk_manual_drive_keys(
        state: &KioskManualDriveProcess,
        nickname: String,
        keys: Vec<String>,
    ) -> Result<(), String> {
        let normalized_nickname = Self::normalize_nickname(&nickname)?;
        let sanitized_keys = Self::sanitize_pressed_keys(keys);

        let running_port = {
            let processes = state.0.lock().unwrap();
            processes
                .get(&normalized_nickname)
                .map(|entry| entry.udp_port)
        };
        let udp_port = running_port.ok_or_else(|| {
            format!(
                "Manual drive bridge is not running for nickname: {}",
                normalized_nickname
            )
        })?;

        Self::send_control_packet(&normalized_nickname, sanitized_keys, udp_port)
    }

    pub fn stop_kiosk_manual_drive(
        state: &KioskManualDriveProcess,
        nickname: String,
    ) -> Result<String, String> {
        let normalized_nickname = Self::normalize_nickname(&nickname)?;

        if let Some(entry) = state.0.lock().unwrap().remove(&normalized_nickname) {
            let _ = Self::send_control_packet(&normalized_nickname, Vec::new(), entry.udp_port);
            entry.shutdown_flag.store(true, Ordering::Relaxed);
            let _ = entry.child.kill();
            Ok(format!(
                "Manual drive bridge stopped for nickname: {}",
                normalized_nickname
            ))
        } else {
            Ok(format!(
                "Manual drive bridge not running for nickname: {}",
                normalized_nickname
            ))
        }
    }

    fn normalize_nickname(value: &str) -> Result<String, String> {
        let normalized = value.trim().trim_start_matches('@').trim();
        if normalized.is_empty() {
            return Err("Nickname cannot be empty".to_string());
        }
        if normalized.contains('/')
            || normalized.contains('\\')
            || normalized.contains('\n')
            || normalized.contains('\r')
            || normalized.contains('\0')
        {
            return Err("Nickname contains invalid characters".to_string());
        }
        Ok(normalized.to_string())
    }

    fn sanitize_pressed_keys(keys: Vec<String>) -> Vec<String> {
        let mut sanitized: Vec<String> = keys
            .into_iter()
            .map(|k| k.trim().to_lowercase())
            .filter(|k| ALLOWED_KEYS.contains(&k.as_str()))
            .collect();
        sanitized.sort();
        sanitized.dedup();
        sanitized
    }

    fn build_control_payload(nickname: &str, keys: Vec<String>) -> Result<String, String> {
        let packet = ManualDriveControlPacket {
            nickname: nickname.to_string(),
            pressed_keys: keys,
            sent_at_ms: Self::now_ms(),
        };
        serde_json::to_string(&packet).map_err(|e| format!("Failed to encode manual drive payload: {}", e))
    }

    fn send_control_packet(nickname: &str, keys: Vec<String>, udp_port: u16) -> Result<(), String> {
        let payload = Self::build_control_payload(nickname, keys)?;
        let socket = UdpSocket::bind("127.0.0.1:0")
            .map_err(|e| format!("Failed to open UDP socket: {}", e))?;
        socket
            .send_to(payload.as_bytes(), ("127.0.0.1", udp_port))
            .map_err(|e| format!("Failed to send manual drive packet: {}", e))?;
        Ok(())
    }

    fn build_command_args(nickname: &str, udp_port: u16) -> Vec<String> {
        vec![
            "python".to_string(),
            "-u".to_string(),
            "src/lerobot/control/sourccey/sourccey/manual_drive_bridge.py".to_string(),
            format!("--id={}", nickname),
            "--remote_ip=127.0.0.1".to_string(),
            format!("--udp_port={}", udp_port),
            "--fps=30".to_string(),
        ]
    }

    fn find_available_udp_port() -> Result<u16, String> {
        let socket = UdpSocket::bind("127.0.0.1:0")
            .map_err(|e| format!("Failed to reserve UDP port for manual drive: {}", e))?;
        socket
            .local_addr()
            .map(|addr| addr.port())
            .map_err(|e| format!("Failed to read reserved UDP port for manual drive: {}", e))
    }

    fn build_envs() -> Result<HashMap<String, String>, String> {
        let mut envs: HashMap<String, String> = std::env::vars().collect();
        let venv_path = DirectoryService::get_virtual_env_path()?;
        envs.insert(
            "VIRTUAL_ENV".to_string(),
            venv_path.to_string_lossy().to_string(),
        );

        let venv_bin_path = DirectoryService::get_virtual_env_bin_path()?
            .display()
            .to_string();
        let separator = if cfg!(windows) { ";" } else { ":" };
        let base_path = std::env::var("PATH").unwrap_or_default();
        envs.insert(
            "PATH".to_string(),
            format!("{}{}{}", venv_bin_path, separator, base_path),
        );
        envs.insert("PYTHONUNBUFFERED".to_string(), "1".to_string());
        envs.insert("DISPLAY".to_string(), ":0".to_string());
        Ok(envs)
    }

    fn manual_drive_log_path() -> Result<std::path::PathBuf, String> {
        let base_dir = DirectoryService::get_current_dir()?;
        Ok(base_dir.join("logs").join("manual-drive.log"))
    }

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

#[cfg(test)]
#[path = "tests/manual_drive_service_tests.rs"]
mod manual_drive_service_tests;

