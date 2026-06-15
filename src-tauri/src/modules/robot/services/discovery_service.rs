use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::ErrorKind;
use std::net::{IpAddr, Ipv4Addr, UdpSocket};
use std::process::Command;
use std::time::{Duration, Instant};

const DISCOVERY_MAGIC: &str = "SOURCCEY_DISCOVER_V1";
const DISCOVERY_PORT: u16 = 42111;
const DEFAULT_COMMAND_PORT: u16 = 5555;
const DEFAULT_OBSERVATION_PORT: u16 = 5556;
const DISCOVERY_TIMEOUT_MS: u64 = 2_500;
const DISCOVERY_READ_TIMEOUT_MS: u64 = 250;
const DISCOVERY_SEND_INTERVAL_MS: u64 = 200;
const DISCOVERY_MAX_SEND_ATTEMPTS: usize = 3;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredLanRobotHost {
    pub ip_address: String,
    pub command_port: u16,
    pub observation_port: u16,
    pub source: String,
    pub robot_name: Option<String>,
    pub nickname: Option<String>,
    pub robot_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LanRobotDiscoveryResult {
    pub local_ip: String,
    pub subnet: String,
    pub hosts: Vec<DiscoveredLanRobotHost>,
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LegacyDiscoveredRobot {
    #[serde(rename = "host")]
    _host: Option<String>,
    robot_name: Option<String>,
    nickname: Option<String>,
    robot_type: Option<String>,
    port_zmq_cmd: Option<u16>,
    port_zmq_observations: Option<u16>,
}

pub struct LanRobotDiscoveryService;

impl LanRobotDiscoveryService {
    pub async fn discover_lan_robots() -> Result<LanRobotDiscoveryResult, String> {
        let local_ip = resolve_private_ipv4().ok_or_else(|| {
            "Unable to detect a private LAN address on this desktop. Connect to the same network as the robot and try again.".to_string()
        })?;
        let subnet = subnet_label(local_ip);
        let hosts = tauri::async_runtime::spawn_blocking(move || broadcast_discover(local_ip))
            .await
            .map_err(|error| format!("Robot discovery task failed: {}", error))??;
        let message = if hosts.is_empty() {
            Some(
                "No robots replied to the Sourccey LAN discovery broadcast. Make sure the robot is powered on, on the same network, and running the discovery service."
                    .to_string(),
            )
        } else {
            None
        };

        Ok(LanRobotDiscoveryResult {
            local_ip: local_ip.to_string(),
            subnet,
            hosts,
            message,
        })
    }
}

fn broadcast_discover(local_ip: Ipv4Addr) -> Result<Vec<DiscoveredLanRobotHost>, String> {
    let socket = UdpSocket::bind(("0.0.0.0", 0))
        .map_err(|e| format!("Failed to bind discovery client socket: {}", e))?;
    socket
        .set_broadcast(true)
        .map_err(|e| format!("Failed to enable broadcast: {}", e))?;
    socket
        .set_read_timeout(Some(Duration::from_millis(DISCOVERY_READ_TIMEOUT_MS)))
        .map_err(|e| format!("Failed to set discovery timeout: {}", e))?;

    let broadcast_targets = get_broadcast_targets(local_ip);
    let mut send_attempts = 0usize;
    let mut last_send_at = Instant::now() - Duration::from_millis(DISCOVERY_SEND_INTERVAL_MS);
    let deadline = Instant::now() + Duration::from_millis(DISCOVERY_TIMEOUT_MS);
    let mut found: HashMap<String, DiscoveredLanRobotHost> = HashMap::new();

    while Instant::now() < deadline {
        if send_attempts < DISCOVERY_MAX_SEND_ATTEMPTS
            && last_send_at.elapsed() >= Duration::from_millis(DISCOVERY_SEND_INTERVAL_MS)
        {
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
                if let Some(entry) = parse_discovery_response(&payload, src.ip()) {
                    found.insert(entry.ip_address.clone(), entry);
                }
            }
            Err(error) => {
                if error.kind() != ErrorKind::WouldBlock && error.kind() != ErrorKind::TimedOut {
                    return Err(format!("Robot discovery receive error: {}", error));
                }
            }
        }
    }

    let mut hosts: Vec<_> = found.into_values().collect();
    hosts.sort_by_key(|host| parse_ipv4(&host.ip_address).map(|ip| ip.octets()[3]).unwrap_or(255));
    Ok(hosts)
}

fn parse_discovery_response(payload: &str, source_ip: IpAddr) -> Option<DiscoveredLanRobotHost> {
    let parsed = serde_json::from_str::<LegacyDiscoveredRobot>(payload).ok()?;
    let ip_address = match source_ip {
        IpAddr::V4(ip) => ip.to_string(),
        IpAddr::V6(ip) => ip.to_string(),
    };

    Some(DiscoveredLanRobotHost {
        ip_address,
        command_port: parsed.port_zmq_cmd.unwrap_or(DEFAULT_COMMAND_PORT),
        observation_port: parsed
            .port_zmq_observations
            .unwrap_or(DEFAULT_OBSERVATION_PORT),
        source: "udp-discovery".to_string(),
        robot_name: parsed.robot_name.filter(|value| !value.trim().is_empty()),
        nickname: parsed.nickname.filter(|value| !value.trim().is_empty()),
        robot_type: parsed.robot_type.filter(|value| !value.trim().is_empty()),
    })
}

fn get_broadcast_targets(local_ip: Ipv4Addr) -> Vec<IpAddr> {
    let mut targets = vec![IpAddr::V4(Ipv4Addr::BROADCAST)];
    let octets = local_ip.octets();
    let subnet_broadcast = IpAddr::V4(Ipv4Addr::new(octets[0], octets[1], octets[2], 255));
    if !targets.contains(&subnet_broadcast) {
        targets.push(subnet_broadcast);
    }
    targets
}

fn resolve_private_ipv4() -> Option<Ipv4Addr> {
    try_udp_route_ipv4().filter(is_private_ipv4).or_else(|| {
        #[cfg(target_os = "windows")]
        {
            read_private_ipv4_from_ipconfig()
        }

        #[cfg(target_os = "linux")]
        {
            read_private_ipv4_from_hostname_i()
        }

        #[cfg(target_os = "macos")]
        {
            read_private_ipv4_from_ifconfig()
        }

        #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
        {
            None
        }
    })
}

fn try_udp_route_ipv4() -> Option<Ipv4Addr> {
    for destination in ["8.8.8.8:80", "1.1.1.1:80"] {
        let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
        if socket.connect(destination).is_ok() {
            if let Ok(local_addr) = socket.local_addr() {
                if let IpAddr::V4(ipv4) = local_addr.ip() {
                    if is_private_ipv4(&ipv4) {
                        return Some(ipv4);
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn read_private_ipv4_from_ipconfig() -> Option<Ipv4Addr> {
    let output = Command::new("ipconfig").output().ok()?;
    let stdout = String::from_utf8(output.stdout).ok()?;
    extract_private_ipv4_from_text(&stdout)
}

#[cfg(target_os = "linux")]
fn read_private_ipv4_from_hostname_i() -> Option<Ipv4Addr> {
    let output = Command::new("hostname").arg("-I").output().ok()?;
    let stdout = String::from_utf8(output.stdout).ok()?;
    extract_private_ipv4_from_text(&stdout)
}

#[cfg(target_os = "macos")]
fn read_private_ipv4_from_ifconfig() -> Option<Ipv4Addr> {
    let output = Command::new("ifconfig").output().ok()?;
    let stdout = String::from_utf8(output.stdout).ok()?;
    extract_private_ipv4_from_text(&stdout)
}

fn extract_private_ipv4_from_text(value: &str) -> Option<Ipv4Addr> {
    value
        .split(|character: char| !(character.is_ascii_digit() || character == '.'))
        .filter_map(parse_ipv4)
        .find(is_private_ipv4)
}

fn parse_ipv4(value: &str) -> Option<Ipv4Addr> {
    value.trim().parse::<Ipv4Addr>().ok()
}

fn is_private_ipv4(ip: &Ipv4Addr) -> bool {
    let [a, b, _, _] = ip.octets();
    (a == 10) || (a == 172 && (16..=31).contains(&b)) || (a == 192 && b == 168)
}

fn subnet_label(ip: Ipv4Addr) -> String {
    let [a, b, c, _] = ip.octets();
    format!("{}.{}.{}.*", a, b, c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_private_ranges() {
        assert!(is_private_ipv4(&Ipv4Addr::new(192, 168, 1, 44)));
        assert!(is_private_ipv4(&Ipv4Addr::new(10, 0, 0, 7)));
        assert!(is_private_ipv4(&Ipv4Addr::new(172, 16, 5, 9)));
        assert!(!is_private_ipv4(&Ipv4Addr::new(8, 8, 8, 8)));
    }

    #[test]
    fn extracts_private_ipv4_from_mixed_text() {
        let sample = "IPv4 Address. . . . . . . . . . . : 192.168.1.25\nSecondary: 8.8.8.8";
        assert_eq!(
            extract_private_ipv4_from_text(sample),
            Some(Ipv4Addr::new(192, 168, 1, 25))
        );
    }

    #[test]
    fn formats_subnet_label() {
        assert_eq!(subnet_label(Ipv4Addr::new(192, 168, 5, 19)), "192.168.5.*");
    }

    #[test]
    fn parses_legacy_discovery_response() {
        let payload = r#"{"host":"","robot_name":"Sourccey","nickname":"sourccey","robot_type":"sourccey","port_zmq_cmd":5555,"port_zmq_observations":5556}"#;
        let parsed = parse_discovery_response(payload, IpAddr::V4(Ipv4Addr::new(192, 168, 1, 42)))
            .expect("expected discovery response");

        assert_eq!(parsed.ip_address, "192.168.1.42");
        assert_eq!(parsed.command_port, 5555);
        assert_eq!(parsed.observation_port, 5556);
        assert_eq!(parsed.source, "udp-discovery");
        assert_eq!(parsed.robot_name.as_deref(), Some("Sourccey"));
        assert_eq!(parsed.nickname.as_deref(), Some("sourccey"));
        assert_eq!(parsed.robot_type.as_deref(), Some("sourccey"));
    }
}
