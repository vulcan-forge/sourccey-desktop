//! Physical Ethernet adapters only; ignore bridges, loopback and virtual links.
use super::{linux_wifi::run_nmcli, split_nmcli_line};
use serde::Serialize;

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct EthernetDevice {
    pub interface: String,
    pub state: String,
    pub cable_connected: bool,
    pub connection: Option<String>,
    pub addresses: Vec<String>,
    pub gateway: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NetworkStatus {
    pub ethernet: Vec<EthernetDevice>,
    pub primary_interface: Option<String>,
    pub connectivity: String,
}

fn value(line: &str) -> Option<(String, String)> {
    let fields = split_nmcli_line(line);
    let (key, rest) = fields.split_first()?;
    Some((key.clone(), rest.join(":")))
}

fn optional(value: String) -> Option<String> {
    (!value.is_empty() && value != "--").then_some(value)
}

fn parse_devices(output: &str) -> Vec<EthernetDevice> {
    let mut devices = Vec::new();
    let mut current = EthernetDevice::default();
    let mut ethernet = false;
    for line in output.lines().chain(std::iter::once("GENERAL.DEVICE:")) {
        let Some((key, val)) = value(line) else {
            continue;
        };
        match key.as_str() {
            "GENERAL.DEVICE" => {
                if ethernet && !current.interface.is_empty() {
                    devices.push(std::mem::take(&mut current));
                }
                current = EthernetDevice {
                    interface: val,
                    ..Default::default()
                };
                ethernet = false;
            }
            "GENERAL.TYPE" => ethernet = val == "ethernet",
            "GENERAL.STATE" => {
                current.state = match val.split_whitespace().next().unwrap_or("") {
                    "100" => "connected",
                    "40" | "50" | "60" | "70" | "80" | "90" => "connecting",
                    "10" => "unmanaged",
                    "20" => "unavailable",
                    "30" => "disconnected",
                    "110" => "disconnecting",
                    "120" => "failed",
                    _ => "unknown",
                }
                .into();
            }
            "GENERAL.CONNECTION" => current.connection = optional(val),
            "WIRED-PROPERTIES.CARRIER" => current.cable_connected = val == "on",
            "IP4.GATEWAY" => current.gateway = optional(val),
            key if key.starts_with("IP4.ADDRESS[") || key.starts_with("IP6.ADDRESS[") => {
                if let Some(address) = optional(val) {
                    current.addresses.push(address);
                }
            }
            _ => {}
        }
    }
    devices
}

fn primary_interface(output: &str) -> Option<String> {
    let mut device = None;
    let mut default4 = false;
    let mut default6 = false;
    let mut ipv6 = None;
    for line in output.lines().chain(std::iter::once("GENERAL.DEVICES:")) {
        let Some((key, val)) = value(line) else {
            continue;
        };
        match key.as_str() {
            "GENERAL.DEVICES" => {
                if default4 && device.is_some() {
                    return device;
                }
                if default6 && device.is_some() && ipv6.is_none() {
                    ipv6 = device.clone();
                }
                device = optional(val);
                default4 = false;
                default6 = false;
            }
            "GENERAL.DEFAULT" => default4 = val == "yes",
            "GENERAL.DEFAULT6" => default6 = val == "yes",
            _ => {}
        }
    }
    ipv6
}

pub(super) fn status() -> Result<NetworkStatus, String> {
    status_with(run_nmcli)
}

fn status_with<F>(mut run: F) -> Result<NetworkStatus, String>
where
    F: FnMut(&[&str]) -> Result<String, String>,
{
    let devices = run(&[
        "-t", "-e", "yes", "-f",
        "GENERAL.DEVICE,GENERAL.TYPE,GENERAL.STATE,GENERAL.CONNECTION,WIRED-PROPERTIES.CARRIER,IP4.ADDRESS,IP4.GATEWAY,IP6.ADDRESS",
        "device", "show",
    ])?;
    let active = run(&["-t", "-f", "UUID", "connection", "show", "--active"])?;
    let mut details = String::new();
    for id in active.lines().filter(|id| !id.is_empty()) {
        // An adapter may vanish between snapshots. Keep reporting the other
        // links instead of turning a normal unplug event into a status error.
        let Ok(connection) = run(&[
            "-t",
            "-e",
            "yes",
            "-f",
            "GENERAL.DEVICES,GENERAL.DEFAULT,GENERAL.DEFAULT6",
            "connection",
            "show",
            "--active",
            "uuid",
            id,
        ]) else {
            continue;
        };
        details.push_str(&connection);
        details.push('\n');
    }
    let connectivity = run(&["networking", "connectivity"])?;
    Ok(NetworkStatus {
        ethernet: parse_devices(&devices),
        primary_interface: primary_interface(&details),
        connectivity: match connectivity.trim() {
            "full" => "full",
            "limited" => "limited",
            "portal" => "portal",
            "none" => "none",
            _ => "unknown",
        }
        .into(),
    })
}

pub(super) fn connect(interface: &str) -> Result<String, String> {
    connect_with(interface, run_nmcli)
}

fn connect_with<F>(interface: &str, mut run: F) -> Result<String, String>
where
    F: FnMut(&[&str]) -> Result<String, String>,
{
    // Validate against discovered devices rather than trusting an IPC argument.
    let devices = run(&[
        "-t",
        "-e",
        "yes",
        "-f",
        "GENERAL.DEVICE,GENERAL.TYPE,GENERAL.STATE,WIRED-PROPERTIES.CARRIER",
        "device",
        "show",
    ])?;
    let device = parse_devices(&devices)
        .into_iter()
        .find(|d| d.interface == interface)
        .ok_or_else(|| {
            "This Ethernet adapter is no longer available. Check the cable and try again."
                .to_string()
        })?;
    if device.state == "unmanaged" {
        return Err("This Ethernet adapter is not managed by the kiosk network service. Ask your IT team to enable NetworkManager for it.".into());
    }
    if !device.cable_connected {
        return Err("Plug an Ethernet cable into the kiosk and router, then try again.".into());
    }
    // NetworkManager reuses a suitable saved profile (including office static
    // IP or 802.1X profiles); otherwise it creates a persistent DHCP profile.
    // Do not reset the office's settings or disconnect the Wi-Fi/hotspot.
    run(&["device", "connect", interface])?;
    Ok("Ethernet connected. Saved network settings are used when available.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    const DEVICES: &str = "GENERAL.DEVICE:enx123\nGENERAL.TYPE:ethernet\nGENERAL.STATE:100 (connected)\nGENERAL.CONNECTION:Office\\:LAN\nWIRED-PROPERTIES.CARRIER:on\nIP4.ADDRESS[1]:10.0.0.2/24\nIP4.GATEWAY:10.0.0.1\nIP6.ADDRESS[1]:2001\\:db8\\:\\:2/64\n\nGENERAL.DEVICE:wlan0\nGENERAL.TYPE:wifi\nGENERAL.STATE:100 (connected)\nGENERAL.DEVICE:br0\nGENERAL.TYPE:bridge\n";

    #[test]
    fn parses_only_physical_ethernet_and_escaped_ipv6() {
        let devices = parse_devices(DEVICES);
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].interface, "enx123");
        assert_eq!(devices[0].state, "connected");
        assert!(devices[0].cable_connected);
        assert_eq!(devices[0].connection.as_deref(), Some("Office:LAN"));
        assert_eq!(devices[0].addresses, ["10.0.0.2/24", "2001:db8::2/64"]);
        assert_eq!(devices[0].gateway.as_deref(), Some("10.0.0.1"));
    }

    #[test]
    fn unplugging_and_dhcp_have_distinct_states() {
        for (code, expected) in [
            ("20", "unavailable"),
            ("30", "disconnected"),
            ("70", "connecting"),
            ("120", "failed"),
            ("10", "unmanaged"),
        ] {
            let output = format!("GENERAL.DEVICE:eth0\nGENERAL.TYPE:ethernet\nGENERAL.STATE:{code} (state)\nWIRED-PROPERTIES.CARRIER:off\n");
            let device = parse_devices(&output).remove(0);
            assert_eq!(device.state, expected);
            assert!(!device.cable_connected);
            assert!(device.addresses.is_empty());
        }
    }

    #[test]
    fn default_route_can_be_wifi_or_ipv6_ethernet() {
        assert_eq!(primary_interface("GENERAL.DEVICES:eth0\nGENERAL.DEFAULT:no\nGENERAL.DEFAULT6:no\nGENERAL.DEVICES:wlan0\nGENERAL.DEFAULT:yes\nGENERAL.DEFAULT6:no\n"), Some("wlan0".into()));
        assert_eq!(
            primary_interface("GENERAL.DEVICES:eth0\nGENERAL.DEFAULT:no\nGENERAL.DEFAULT6:yes\n"),
            Some("eth0".into())
        );
        assert_eq!(primary_interface(""), None);
        assert_eq!(primary_interface("GENERAL.DEVICES:wlan0\nGENERAL.DEFAULT:no\nGENERAL.DEFAULT6:yes\nGENERAL.DEVICES:eth0\nGENERAL.DEFAULT:yes\nGENERAL.DEFAULT6:no\n"), Some("eth0".into()));
    }

    #[test]
    fn live_status_uses_profile_details_and_survives_a_removed_adapter() {
        let status = status_with(|args| {
            if args.contains(&"device") {
                return Ok(DEVICES.into());
            }
            if args == ["networking", "connectivity"] {
                return Ok("portal\n".into());
            }
            if args.contains(&"UUID") {
                return Ok("removed\nwifi\nwired\n".into());
            }
            assert!(args.contains(&"--active") && args.contains(&"uuid"));
            match args.last().copied().unwrap() {
                "removed" => Err("Unknown connection".into()),
                "wifi" => {
                    Ok("GENERAL.DEVICES:wlan0\nGENERAL.DEFAULT:no\nGENERAL.DEFAULT6:yes\n".into())
                }
                "wired" => {
                    Ok("GENERAL.DEVICES:enx123\nGENERAL.DEFAULT:yes\nGENERAL.DEFAULT6:no\n".into())
                }
                _ => panic!("Unexpected command"),
            }
        })
        .unwrap();
        assert_eq!(status.primary_interface.as_deref(), Some("enx123"));
        assert_eq!(status.connectivity, "portal");
        assert_eq!(status.ethernet.len(), 1);
    }

    #[test]
    fn connection_reuses_networkmanager_profiles_without_touching_wifi() {
        let mut connected = false;
        connect_with("enx123", |args| {
            if args.contains(&"show") {
                return Ok(DEVICES.into());
            }
            assert_eq!(args, ["device", "connect", "enx123"]);
            connected = true;
            Ok(String::new())
        })
        .unwrap();
        assert!(connected);
        assert!(connect_with("wlan0", |_| Ok(DEVICES.into())).is_err());
        assert!(connect_with("missing", |_| Ok(DEVICES.into())).is_err());
    }

    #[test]
    fn missing_cable_and_unmanaged_adapters_never_activate() {
        for (state, carrier) in [("30", "off"), ("10", "on")] {
            let mut calls = 0;
            assert!(connect_with("eth0", |_| {
                calls += 1;
                Ok(format!("GENERAL.DEVICE:eth0\nGENERAL.TYPE:ethernet\nGENERAL.STATE:{state}\nWIRED-PROPERTIES.CARRIER:{carrier}\n"))
            }).is_err());
            assert_eq!(calls, 1);
        }
    }
}
