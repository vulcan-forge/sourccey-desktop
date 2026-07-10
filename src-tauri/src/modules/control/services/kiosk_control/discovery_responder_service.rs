use crate::modules::control::services::kiosk_control::kiosk_host_service::{
    KioskHostProcess, KioskHostService,
};
use serde::Serialize;
use std::io::ErrorKind;
use std::net::UdpSocket;
use std::thread;
use std::time::Duration;

const DISCOVERY_MAGIC: &str = "SOURCCEY_DISCOVER_V1";
const DISCOVERY_PORT: u16 = 42111;
const SOURCCEY_COMMAND_PORT: u16 = 5555;
const SOURCCEY_OBSERVATION_PORT: u16 = 5556;
const DISCOVERY_READ_TIMEOUT_MS: u64 = 250;

#[derive(Serialize)]
struct DiscoveryResponsePayload {
    discovery_magic: &'static str,
    robot_type: &'static str,
    host_running: bool,
    command_port: u16,
    observation_port: u16,
}

pub struct KioskDiscoveryResponderService;

impl KioskDiscoveryResponderService {
    pub fn start(host_state: KioskHostProcess) -> Result<(), String> {
        let socket = UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT))
            .map_err(|e| format!("Failed to bind kiosk discovery responder socket: {}", e))?;
        socket
            .set_read_timeout(Some(Duration::from_millis(DISCOVERY_READ_TIMEOUT_MS)))
            .map_err(|e| {
                format!(
                    "Failed to configure kiosk discovery responder timeout: {}",
                    e
                )
            })?;

        thread::spawn(move || {
            let mut buf = [0_u8; 1024];

            loop {
                match socket.recv_from(&mut buf) {
                    Ok((size, address)) => {
                        if String::from_utf8_lossy(&buf[..size]).trim() != DISCOVERY_MAGIC {
                            continue;
                        }

                        let payload = Self::build_discovery_response_payload(
                            KioskHostService::is_any_kiosk_host_active(&host_state),
                        );
                        let _ = socket.send_to(&payload, address);
                    }
                    Err(error) => {
                        if error.kind() != ErrorKind::WouldBlock
                            && error.kind() != ErrorKind::TimedOut
                        {
                            eprintln!("Kiosk discovery responder socket error: {}", error);
                            break;
                        }
                    }
                }
            }
        });

        Ok(())
    }

    fn build_discovery_response_payload(host_running: bool) -> Vec<u8> {
        serde_json::to_vec(&DiscoveryResponsePayload {
            discovery_magic: DISCOVERY_MAGIC,
            robot_type: "sourccey",
            host_running,
            command_port: SOURCCEY_COMMAND_PORT,
            observation_port: SOURCCEY_OBSERVATION_PORT,
        })
        .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::KioskDiscoveryResponderService;

    #[test]
    fn discovery_payload_reports_stopped_host_with_ports() {
        let payload = KioskDiscoveryResponderService::build_discovery_response_payload(false);
        let parsed: serde_json::Value =
            serde_json::from_slice(&payload).expect("payload should be valid JSON");

        assert_eq!(parsed["discovery_magic"], "SOURCCEY_DISCOVER_V1");
        assert_eq!(parsed["robot_type"], "sourccey");
        assert_eq!(parsed["host_running"], false);
        assert_eq!(parsed["command_port"], 5555);
        assert_eq!(parsed["observation_port"], 5556);
    }

    #[test]
    fn discovery_payload_reports_running_host() {
        let payload = KioskDiscoveryResponderService::build_discovery_response_payload(true);
        let parsed: serde_json::Value =
            serde_json::from_slice(&payload).expect("payload should be valid JSON");

        assert_eq!(parsed["host_running"], true);
    }
}
