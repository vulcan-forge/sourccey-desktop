use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;
use std::process::{Command, Stdio};

const PROFILE_NAME: &str = "Sourccey Hotspot";
const PROFILE_OWNER: &str = "sourccey-kiosk-hotspot";
pub const HOTSPOT_ADDRESS: &str = "192.168.4.1";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AccessPointStatus {
    pub active: bool,
    pub ssid: Option<String>,
    pub ip_address: Option<String>,
    pub interface: Option<String>,
    pub uuid: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WiFiModeResult {
    pub reconnected: bool,
    pub message: String,
}

type NmResult = Result<String, String>;

fn run_nmcli(args: &[&str]) -> NmResult {
    let output = Command::new("nmcli")
        .env("LC_ALL", "C")
        .args(["--colors", "no", "--escape", "no", "--wait", "30"])
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("Could not run NetworkManager: {e}"))?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
    }
    let mut error = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if let Some(pair) = args.windows(2).find(|pair| pair[0] == "wifi-sec.psk") {
        error = error.replace(pair[1], "[REDACTED]");
    }
    if error.is_empty() {
        error = format!("NetworkManager exited with {}", output.status);
    }
    if error.to_ascii_lowercase().contains("not authorized") {
        error.push_str(
            ". Repair the kiosk permission with: sudo python3 setup/kiosk/setup.py --network-permission-only",
        );
    }
    Err(error)
}

pub fn validate_credentials(ssid: &str, password: &str) -> Result<(), String> {
    if ssid.is_empty() || ssid.len() > 32 || ssid.chars().any(char::is_control) {
        return Err(
            "Robot network name must contain 1 to 32 bytes and no control characters".into(),
        );
    }
    if !(8..=63).contains(&password.len()) || !password.bytes().all(|b| (32..=126).contains(&b)) {
        return Err(
            "Robot network password must contain 8 to 63 printable ASCII characters".into(),
        );
    }
    Ok(())
}

fn wifi_type(kind: &str) -> bool {
    matches!(kind, "wifi" | "802-11-wireless")
}

fn status_with<F>(run: &mut F) -> Result<AccessPointStatus, String>
where
    F: FnMut(&[&str]) -> NmResult,
{
    let active = run(&[
        "-t",
        "-e",
        "no",
        "-f",
        "UUID,TYPE,DEVICE",
        "connection",
        "show",
        "--active",
    ])?;
    for line in active.lines() {
        let parts: Vec<_> = line.splitn(3, ':').collect();
        if parts.len() != 3 || !wifi_type(parts[1]) || parts[2].is_empty() || parts[2] == "--" {
            continue;
        }
        let uuid = parts[0];
        if run(&[
            "-g",
            "802-11-wireless.mode",
            "connection",
            "show",
            "uuid",
            uuid,
        ])?
        .trim()
            != "ap"
        {
            continue;
        }
        let ssid = run(&[
            "-g",
            "802-11-wireless.ssid",
            "connection",
            "show",
            "uuid",
            uuid,
        ])?;
        let addresses = run(&["-g", "IP4.ADDRESS", "device", "show", parts[2]])?;
        let ip = addresses
            .lines()
            .filter_map(|line| line.split('/').next()?.parse::<Ipv4Addr>().ok())
            .find(|ip| !ip.is_unspecified() && !ip.is_loopback());
        return Ok(AccessPointStatus {
            active: true,
            ssid: Some(ssid.trim_end_matches(['\r', '\n']).to_string()),
            ip_address: ip.map(|ip| ip.to_string()),
            interface: Some(parts[2].into()),
            uuid: Some(uuid.into()),
        });
    }
    Ok(AccessPointStatus::default())
}

pub fn status() -> Result<AccessPointStatus, String> {
    status_with(&mut run_nmcli)
}

fn find_adapter<F>(run: &mut F) -> Result<String, String>
where
    F: FnMut(&[&str]) -> NmResult,
{
    let devices = run(&["-t", "-e", "no", "-f", "DEVICE,TYPE", "device", "status"])?;
    let mut candidates: Vec<_> = devices
        .lines()
        .filter_map(|line| {
            let (device, kind) = line.split_once(':')?;
            (kind == "wifi").then_some(device)
        })
        .collect();
    candidates.sort_by_key(|name| *name != "wlan0");
    for device in candidates {
        let supported = run(&["-g", "WIFI-PROPERTIES.AP", "device", "show", device])?;
        let managed = run(&["-g", "GENERAL.NM-MANAGED", "device", "show", device])?;
        if supported.trim() == "yes" && managed.trim() == "yes" {
            return Ok(device.into());
        }
    }
    Err("No managed Wi-Fi adapter supports access point mode. Check the Wi-Fi adapter and the Pi's wireless country setting".into())
}

fn profile_args<'a>(
    ssid: &'a str,
    password: &'a str,
    uuid: &'a str,
    device: &'a str,
) -> Vec<&'a str> {
    vec![
        "connection",
        "add",
        "type",
        "wifi",
        "ifname",
        device,
        "con-name",
        PROFILE_NAME,
        "connection.uuid",
        uuid,
        "connection.stable-id",
        PROFILE_OWNER,
        "connection.autoconnect",
        "no",
        "wifi.ssid",
        ssid,
        "wifi.mode",
        "ap",
        "wifi.band",
        "bg",
        "wifi.channel",
        "6",
        "wifi.powersave",
        "2",
        "wifi-sec.key-mgmt",
        "wpa-psk",
        "wifi-sec.proto",
        "rsn",
        "wifi-sec.pairwise",
        "ccmp",
        "wifi-sec.group",
        "ccmp",
        "wifi-sec.psk",
        password,
        "wifi-sec.psk-flags",
        "0",
        "wifi-sec.pmf",
        "2",
        "ipv4.method",
        "shared",
        "ipv4.addresses",
        "192.168.4.1/24",
        "ipv6.method",
        "disabled",
    ]
}

fn restore_after_failure<F>(
    run: &mut F,
    uuid: &str,
    previous: &str,
    device: &str,
    error: String,
) -> String
where
    F: FnMut(&[&str]) -> NmResult,
{
    let _ = run(&["connection", "delete", "uuid", uuid]);
    if !previous.is_empty() && previous != "--" {
        if let Err(restore) = run(&["connection", "up", "uuid", previous, "ifname", device]) {
            return format!("{error}. Previous Wi-Fi could not be restored: {restore}");
        }
    }
    error
}

fn enable_with<F>(
    ssid: &str,
    password: &str,
    uuid: &str,
    run: &mut F,
) -> Result<AccessPointStatus, String>
where
    F: FnMut(&[&str]) -> NmResult,
{
    validate_credentials(ssid, password)?;
    let device = find_adapter(run)?;
    let previous = run(&["-g", "GENERAL.CON-UUID", "device", "show", &device])?;
    run(&["radio", "wifi", "on"])?;
    let profiles = run(&["-t", "-e", "no", "-f", "UUID,NAME", "connection", "show"])?;
    // Creation doesn't interrupt station mode; activation performs the switch.
    run(&profile_args(ssid, password, uuid, &device))
        .map_err(|e| format!("Could not create robot Wi-Fi: {e}"))?;
    if let Err(error) = run(&["connection", "up", "uuid", uuid, "ifname", &device]) {
        return Err(restore_after_failure(run, uuid, previous.trim(), &device,
            format!("Could not start robot Wi-Fi: {error}. Check the wireless country setting and run kiosk setup to repair NetworkManager/DHCP dependencies")));
    }
    let verified = match status_with(run) {
        Ok(state)
            if state.active
                && state.uuid.as_deref() == Some(uuid)
                && state.ip_address.as_deref() == Some(HOTSPOT_ADDRESS) =>
        {
            state
        }
        result => {
            let error = match result {
                Err(e) => e,
                _ => "Hotspot activation did not produce the expected network address".into(),
            };
            return Err(restore_after_failure(
                run,
                uuid,
                previous.trim(),
                &device,
                error,
            ));
        }
    };
    if let Err(error) = run(&[
        "connection",
        "modify",
        "uuid",
        uuid,
        "connection.autoconnect",
        "yes",
    ]) {
        return Err(restore_after_failure(
            run,
            uuid,
            previous.trim(),
            &device,
            error,
        ));
    }
    for line in profiles.lines() {
        let Some((old_uuid, name)) = line.split_once(':') else {
            continue;
        };
        if name == PROFILE_NAME
            && old_uuid != uuid
            && run(&[
                "-g",
                "connection.stable-id",
                "connection",
                "show",
                "uuid",
                old_uuid,
            ])
            .is_ok_and(|owner| owner.trim() == PROFILE_OWNER)
        {
            let _ = run(&["connection", "delete", "uuid", old_uuid]);
        }
    }
    Ok(verified)
}

pub fn enable(ssid: &str, password: &str) -> Result<AccessPointStatus, String> {
    enable_with(
        ssid,
        password,
        &uuid::Uuid::now_v7().to_string(),
        &mut run_nmcli,
    )
}

fn disable_with<F>(preferred_ssid: &str, run: &mut F) -> Result<WiFiModeResult, String>
where
    F: FnMut(&[&str]) -> NmResult,
{
    let active = status_with(run)?;
    if let Some(uuid) = active.uuid.as_deref() {
        // Keep credentials but stop this profile from restarting on reboot.
        run(&[
            "connection",
            "modify",
            "uuid",
            uuid,
            "connection.autoconnect",
            "no",
        ])?;
        run(&["connection", "down", "uuid", uuid])?;
        if status_with(run)?.active {
            return Err("Robot Wi-Fi is still active; it could not be disabled".into());
        }
    }
    let profiles = run(&["-t", "-e", "no", "-f", "UUID,TYPE", "connection", "show"])?;
    let mut stations = Vec::new();
    for line in profiles.lines() {
        let Some((uuid, kind)) = line.split_once(':') else {
            continue;
        };
        if !wifi_type(kind) {
            continue;
        }
        if run(&[
            "-g",
            "802-11-wireless.mode",
            "connection",
            "show",
            "uuid",
            uuid,
        ])?
        .trim()
            == "ap"
        {
            continue;
        }
        let ssid = run(&[
            "-g",
            "802-11-wireless.ssid",
            "connection",
            "show",
            "uuid",
            uuid,
        ])?;
        stations.push((
            uuid.to_string(),
            ssid.trim_end_matches(['\r', '\n']).to_string(),
        ));
    }
    stations.sort_by_key(|(_, ssid)| ssid != preferred_ssid);
    for (uuid, ssid) in stations.iter().take(3) {
        if run(&["connection", "up", "uuid", uuid]).is_ok() {
            // Use NetworkManager's successful activation result, not a substring
            // match against a profile display name or unrelated active network.
            return Ok(WiFiModeResult {
                reconnected: true,
                message: format!("Robot Wi-Fi router disabled. Reconnected to {ssid}."),
            });
        }
    }
    Ok(WiFiModeResult { reconnected: false, message: "Robot Wi-Fi router disabled. No saved Wi-Fi network could be reached; select a network from the Wi-Fi menu.".into() })
}

pub fn disable(preferred_ssid: &str) -> Result<WiFiModeResult, String> {
    disable_with(preferred_ssid, &mut run_nmcli)
}

#[cfg(test)]
mod tests {
    use super::*;
    const UUID: &str = "01900000-0000-7000-8000-000000000001";

    struct FakeNetwork {
        activated: bool,
        fail_up: bool,
        fail_status: bool,
        ap_supported: bool,
        deleted: Vec<String>,
        restored: bool,
    }
    impl Default for FakeNetwork {
        fn default() -> Self {
            Self {
                activated: false,
                fail_up: false,
                fail_status: false,
                ap_supported: true,
                deleted: Vec::new(),
                restored: false,
            }
        }
    }
    impl FakeNetwork {
        fn run(&mut self, args: &[&str]) -> NmResult {
            if args.contains(&"DEVICE,TYPE") {
                return Ok("p2p:wifi-p2p\nwlan0:wifi\n".into());
            }
            if args.contains(&"WIFI-PROPERTIES.AP") {
                return Ok(if self.ap_supported { "yes" } else { "no" }.into());
            }
            if args.contains(&"GENERAL.NM-MANAGED") {
                return Ok("yes".into());
            }
            if args.contains(&"GENERAL.CON-UUID") {
                return Ok("previous\n".into());
            }
            if args.contains(&"UUID,NAME") {
                return Ok("old:Sourccey Hotspot\n".into());
            }
            if args.contains(&"UUID,TYPE,DEVICE") {
                if self.fail_status {
                    return Err("NetworkManager unavailable".into());
                }
                return Ok(if self.activated {
                    format!("{UUID}:802-11-wireless:wlan0\n")
                } else {
                    String::new()
                });
            }
            if args.starts_with(&["connection", "up"]) {
                if args[3] == "previous" {
                    self.restored = true;
                    return Ok(String::new());
                }
                if self.fail_up {
                    return Err("AP activation failed".into());
                }
                self.activated = true;
            }
            if args.contains(&"802-11-wireless.mode") {
                return Ok("ap\n".into());
            }
            if args.contains(&"802-11-wireless.ssid") {
                return Ok("Robot Lab\n".into());
            }
            if args.contains(&"IP4.ADDRESS") {
                return Ok("192.168.4.1/24\n".into());
            }
            if args[0] == "-g" && args.contains(&"connection.stable-id") {
                return Ok(PROFILE_OWNER.into());
            }
            if args.starts_with(&["connection", "delete"]) {
                self.deleted.push(args[3].into());
            }
            Ok(String::new())
        }
    }

    #[test]
    fn enables_and_verifies_real_address_before_removing_old_profiles() {
        let mut fake = FakeNetwork::default();
        let result = enable_with("Robot Lab", "synthetic-password", UUID, &mut |args| {
            fake.run(args)
        })
        .unwrap();
        assert!(result.active);
        assert_eq!(result.ip_address.as_deref(), Some(HOTSPOT_ADDRESS));
        assert_eq!(fake.deleted, ["old"]);
    }
    #[test]
    fn failed_activation_restores_station_and_removes_only_new_profile() {
        let mut fake = FakeNetwork {
            fail_up: true,
            ..Default::default()
        };
        assert!(
            enable_with("Robot Lab", "synthetic-password", UUID, &mut |args| fake
                .run(args))
            .is_err()
        );
        assert!(fake.restored);
        assert_eq!(fake.deleted, [UUID]);
    }
    #[test]
    fn unsupported_adapters_are_rejected_before_changing_connections() {
        let mut fake = FakeNetwork {
            ap_supported: false,
            ..Default::default()
        };
        assert!(
            enable_with("Robot Lab", "synthetic-password", UUID, &mut |args| fake
                .run(args))
            .is_err()
        );
        assert!(!fake.activated && fake.deleted.is_empty());
    }

    #[test]
    fn missing_assigned_address_rolls_back_instead_of_reporting_success() {
        let mut fake = FakeNetwork::default();
        let result = enable_with("Robot Lab", "synthetic-password", UUID, &mut |args| {
            if args.contains(&"IP4.ADDRESS") {
                return Ok(String::new());
            }
            fake.run(args)
        });
        assert!(result.unwrap_err().contains("expected network address"));
        assert!(fake.restored);
        assert_eq!(fake.deleted, [UUID]);
    }

    #[test]
    fn profile_creation_failure_does_not_disconnect_existing_wifi() {
        let mut fake = FakeNetwork::default();
        let result = enable_with("Robot Lab", "synthetic-password", UUID, &mut |args| {
            if args.starts_with(&["connection", "add"]) {
                return Err("Not authorized".into());
            }
            assert!(!args.starts_with(&["connection", "down"]));
            assert!(!args.starts_with(&["device", "disconnect"]));
            fake.run(args)
        });
        assert!(result.unwrap_err().contains("Not authorized"));
        assert!(!fake.activated && fake.deleted.is_empty());
    }

    #[test]
    fn disabling_active_hotspot_stops_autoconnect_and_keeps_saved_credentials() {
        let mut fake = FakeNetwork {
            activated: true,
            ..Default::default()
        };
        let mut autoconnect_disabled = false;
        let result = disable_with("", &mut |args| {
            if args.starts_with(&["connection", "modify"]) {
                assert_eq!(
                    args,
                    [
                        "connection",
                        "modify",
                        "uuid",
                        UUID,
                        "connection.autoconnect",
                        "no"
                    ]
                );
                autoconnect_disabled = true;
            }
            if args.starts_with(&["connection", "down"]) {
                assert!(autoconnect_disabled);
                fake.activated = false;
            }
            fake.run(args)
        })
        .unwrap();
        assert!(!fake.activated);
        assert!(fake.deleted.is_empty());
        assert!(!result.reconnected);
    }
    #[test]
    fn status_errors_are_not_reported_as_off() {
        let mut fake = FakeNetwork {
            fail_status: true,
            ..Default::default()
        };
        assert!(status_with(&mut |args| fake.run(args)).is_err());
    }
    #[test]
    fn verifies_mode_instead_of_hotspot_name_and_never_fabricates_an_ip() {
        let mut fake = FakeNetwork {
            activated: true,
            ..Default::default()
        };
        let result = status_with(&mut |args| {
            if args.contains(&"IP4.ADDRESS") {
                return Ok(String::new());
            }
            fake.run(args)
        })
        .unwrap();
        assert!(result.active);
        assert!(result.ip_address.is_none());
    }
    #[test]
    fn reconnects_by_uuid_even_when_profile_name_differs_from_ssid() {
        let result = disable_with("Lab", &mut |args: &[&str]| {
            if args.contains(&"UUID,TYPE,DEVICE") {
                return Ok(String::new());
            }
            if args.contains(&"UUID,TYPE") {
                return Ok("saved-uuid:802-11-wireless\n".into());
            }
            if args.contains(&"802-11-wireless.mode") {
                return Ok("infrastructure\n".into());
            }
            if args.contains(&"802-11-wireless.ssid") {
                return Ok("Lab\n".into());
            }
            assert_eq!(args, ["connection", "up", "uuid", "saved-uuid"]);
            Ok(String::new())
        })
        .unwrap();
        assert!(result.reconnected);
    }
    #[test]
    fn no_saved_wifi_is_reported_honestly() {
        let result = disable_with("", &mut |_| Ok(String::new())).unwrap();
        assert!(!result.reconnected);
        assert!(result.message.contains("No saved Wi-Fi"));
    }
    #[test]
    fn rejects_invalid_credentials_before_any_network_operation() {
        for (ssid, pass) in [
            ("", "password"),
            ("Lab", "short"),
            ("Lab", "passwörd"),
            ("Lab\n", "password"),
        ] {
            assert!(enable_with(ssid, pass, UUID, &mut |_| panic!("must not run nmcli")).is_err());
        }
    }
    #[test]
    fn exports_offline_hotspot_fixture() {
        let Ok(path) = std::env::var("SOURCCEY_AP_FIXTURES") else {
            return;
        };
        let fixture = serde_json::json!({ "args": profile_args("Robot Lab", "synthetic-password", UUID, "wlan0") });
        std::fs::write(path, serde_json::to_vec_pretty(&fixture).unwrap()).unwrap();
    }
}
