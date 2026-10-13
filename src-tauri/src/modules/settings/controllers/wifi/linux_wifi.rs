//! NetworkManager connection profiles for the Pi kiosk. Compiled in tests on every OS.

use std::process::{Command, Stdio};
use std::{fs::OpenOptions, io::Write, path::PathBuf};

const PROFILE_OWNER: &str = "sourccey-kiosk-wifi";

// nmcli may request secrets again during authentication even when a profile
// contains a PSK. A kiosk has no interactive secret agent. Supply the secret at
// activation as well, in a private file that is removed on every return path.
struct ActivationSecret(PathBuf);

impl ActivationSecret {
    fn create(password: &str) -> Result<Self, String> {
        let path =
            std::env::temp_dir().join(format!("sourccey-wifi-{}.secret", uuid::Uuid::now_v7()));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&path).map_err(|_| {
            "Could not securely prepare the Wi-Fi password. Restart the kiosk and try again"
                .to_string()
        })?;
        let secret = Self(path);
        writeln!(file, "802-11-wireless-security.psk:{password}").map_err(|_| {
            "Could not securely prepare the Wi-Fi password. Restart the kiosk and try again"
                .to_string()
        })?;
        Ok(secret)
    }
}

impl Drop for ActivationSecret {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

pub(super) fn user_error(error: String) -> String {
    let lower = error.to_ascii_lowercase();
    if lower.contains("not authorized") || lower.contains("permission denied") {
        "Network access was denied. Run kiosk network permission repair, then try again.".into()
    } else if lower.contains("secrets")
        || lower.contains("authentication")
        || lower.contains("wrong password")
        || lower.contains("passwd-file")
    {
        "Could not authenticate with this Wi-Fi network. Check the password and try again. If it still fails, ask your IT team to check the network's security settings.".into()
    } else if lower.contains("ip configuration") || lower.contains("dhcp") {
        "The network did not assign an IP address. Check the router or contact your IT team.".into()
    } else if lower.contains("ssid") && lower.contains("not found") {
        "This Wi-Fi network is no longer in range. Refresh the network list and try again.".into()
    } else if lower.contains("timed out") || lower.contains("timeout") {
        "The network took too long to respond. Check the connection and try again.".into()
    } else if lower.contains("could not run networkmanager")
        || lower.contains("networkmanager is not running")
    {
        "The network service is unavailable. Restart the kiosk or run kiosk setup to repair it."
            .into()
    } else if error.starts_with("This network")
        || error.starts_with("This Wi-Fi")
        || error.starts_with("Could not determine")
        || error.starts_with("A password")
        || error.starts_with("Open networks")
        || error.starts_with("The Wi-Fi")
        || error.starts_with("Robot hotspot")
        || error.starts_with("Could not securely")
    {
        error
    } else {
        "Could not complete the network request. Check the connection and try again.".into()
    }
}

#[derive(Debug, PartialEq, Eq)]
struct Security {
    key_mgmt: Option<&'static str>,
    proto: Option<&'static str>,
    pmf: &'static str,
}

fn classify_security(value: &str) -> Result<Security, String> {
    let value = value.trim().to_ascii_uppercase();
    if value == "OPEN" || value == "--" || value == "NONE" {
        return Ok(Security {
            key_mgmt: None,
            proto: None,
            pmf: "0",
        });
    }
    if value.contains("802.1X")
        || value.contains("8021X")
        || value.contains("EAP")
        || value.contains("ENTERPRISE")
    {
        return Err("This network uses enterprise Wi-Fi. It requires identity and EAP settings that the kiosk does not currently collect".into());
    }
    if value.contains("OWE") || value.contains("WEP") {
        return Err("This Wi-Fi security type is not supported by the kiosk".into());
    }
    let tokens: Vec<_> = value.split(|c: char| !c.is_ascii_alphanumeric()).collect();
    let has = |token| tokens.contains(&token);
    let wpa1 = has("WPA") || has("WPA1");
    let wpa2 = has("WPA2");
    let sae = has("WPA3") || has("SAE");
    if sae && !wpa2 && !wpa1 {
        // WPA3 Personal requires SAE and protected management frames; never fall
        // back to WPA2 for a WPA3-only network.
        return Ok(Security {
            key_mgmt: Some("sae"),
            proto: Some("rsn"),
            pmf: "3",
        });
    }
    if wpa1 || wpa2 || has("PSK") {
        // NetworkManager's wpa-psk supports Personal transition mode. Keep PMF
        // optional for WPA2 compatibility and don't pin ciphers to CCMP: WPA1
        // access points may use TKIP.
        return Ok(Security {
            key_mgmt: Some("wpa-psk"),
            proto: if wpa1 && !wpa2 && !sae {
                Some("wpa")
            } else if wpa2 && !wpa1 {
                Some("rsn")
            } else {
                None
            },
            pmf: if wpa1 && !wpa2 && !sae { "1" } else { "2" },
        });
    }
    Err(
        "Could not determine the network's Wi-Fi security. Refresh the network list and try again"
            .into(),
    )
}

fn profile_args<'a>(
    ssid: &'a str,
    password: &'a str,
    uuid: &'a str,
    name: &'a str,
    security: &'a Security,
) -> Vec<&'a str> {
    let mut args = vec![
        "connection",
        "add",
        "type",
        "wifi",
        "ifname",
        "*",
        "con-name",
        name,
        "connection.uuid",
        uuid,
        "connection.stable-id",
        PROFILE_OWNER,
        "connection.autoconnect",
        "no",
        "wifi.ssid",
        ssid,
        "wifi.mode",
        "infrastructure",
        "ipv4.method",
        "auto",
        "ipv6.method",
        "auto",
    ];
    if let Some(key_mgmt) = security.key_mgmt {
        args.extend([
            "wifi-sec.key-mgmt",
            key_mgmt,
            "wifi-sec.psk",
            password,
            "wifi-sec.psk-flags",
            "0",
            "wifi-sec.pmf",
            security.pmf,
        ]);
        if let Some(proto) = security.proto {
            args.extend(["wifi-sec.proto", proto]);
        }
    }
    args
}

pub(super) fn run_nmcli(args: &[&str]) -> Result<String, String> {
    let output = Command::new("nmcli")
        .env("LC_ALL", "C")
        .args(["--colors", "no", "--wait", "90"])
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("Could not run NetworkManager: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let mut error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        // NetworkManager validation errors may echo an invalid property value.
        if let Some(pair) = args.windows(2).find(|pair| pair[0] == "wifi-sec.psk") {
            if !pair[1].is_empty() {
                error = error.replace(pair[1], "[REDACTED]");
            }
        }
        if error.is_empty() {
            error = format!("NetworkManager exited with {}", output.status);
        }
        Err(error)
    }
}

pub(super) fn connect(
    ssid: &str,
    password: &str,
    security: &str,
    uuid: &str,
) -> Result<String, String> {
    connect_with(ssid, password, security, uuid, run_nmcli)
}

pub(super) fn active_station<F>(run: &mut F) -> Result<Option<(String, String)>, String>
where
    F: FnMut(&[&str]) -> Result<String, String>,
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
        if parts.len() != 3
            || !matches!(parts[1], "wifi" | "802-11-wireless")
            || parts[2].is_empty()
            || parts[2] == "--"
        {
            continue;
        }
        let mode = run(&[
            "-g",
            "802-11-wireless.mode",
            "connection",
            "show",
            "uuid",
            parts[0],
        ])?;
        if mode.trim() == "ap" {
            return Err("Robot hotspot mode is active. Switch to Wi-Fi mode before connecting to an existing network".into());
        }
        if mode.trim() == "infrastructure" || mode.trim().is_empty() {
            return Ok(Some((parts[0].into(), parts[2].into())));
        }
    }
    Ok(None)
}

fn connect_with<F>(
    ssid: &str,
    password: &str,
    security: &str,
    uuid: &str,
    mut run: F,
) -> Result<String, String>
where
    F: FnMut(&[&str]) -> Result<String, String>,
{
    if ssid.is_empty() || ssid.len() > 32 || ssid.contains('\0') {
        return Err("The Wi-Fi network name must contain 1 to 32 bytes".into());
    }
    let security = classify_security(security)?;
    if security.key_mgmt.is_some() && password.is_empty() {
        return Err("A password is required for this Wi-Fi network".into());
    }
    if security.key_mgmt.is_none() && !password.is_empty() {
        return Err("Open networks do not require a password".into());
    }
    if password.contains(['\r', '\n', '\0']) {
        return Err("The Wi-Fi password cannot contain line breaks or null characters".into());
    }
    if security.key_mgmt == Some("wpa-psk")
        && !((8..=63).contains(&password.len())
            || (password.len() == 64 && password.bytes().all(|b| b.is_ascii_hexdigit())))
    {
        return Err(
            "The Wi-Fi password must contain 8 to 63 bytes, or a 64-digit hexadecimal key".into(),
        );
    }
    let secret = if security.key_mgmt.is_some() {
        Some(ActivationSecret::create(password)?)
    } else {
        None
    };
    let name = format!("Sourccey Wi-Fi - {ssid}");

    let previous = active_station(&mut run)?;

    // Remember candidates, but never delete a saved profile before activation.
    // UUIDs make activation unambiguous even when profile names are duplicated.
    let old_profiles: Vec<String> =
        run(&["-t", "-e", "no", "-f", "UUID,NAME", "connection", "show"])
            .unwrap_or_default()
            .lines()
            .filter_map(|line| {
                let (id, profile_name) = line.split_once(':')?;
                (profile_name == name && id != uuid).then(|| id.to_string())
            })
            .collect();
    run(&profile_args(ssid, password, uuid, &name, &security))
        .map_err(|e| format!("Failed to create Wi-Fi profile: {e}"))?;
    if let Err(e) = run(&["radio", "wifi", "on"]) {
        let _ = run(&["connection", "delete", "uuid", uuid]);
        return Err(format!("Could not enable Wi-Fi radio: {e}"));
    }
    let mut activation = vec!["connection", "up", "uuid", uuid];
    let secret_path = secret
        .as_ref()
        .map(|secret| secret.0.to_string_lossy().into_owned());
    if let Some(path) = secret_path.as_deref() {
        activation.extend(["passwd-file", path]);
    }
    if let Err(e) = run(&activation) {
        // Failed attempts must not become autoconnect candidates on reboot.
        let _ = run(&["connection", "delete", "uuid", uuid]);
        if let Some((old_uuid, device)) = previous {
            if let Err(restore) = run(&["connection", "up", "uuid", &old_uuid, "ifname", &device]) {
                return Err(format!(
                    "Connection failed: {e}. Previous connection could not be restored: {restore}"
                ));
            }
        }
        return Err(format!("Connection failed: {e}"));
    }
    if run(&[
        "connection",
        "modify",
        "uuid",
        uuid,
        "connection.autoconnect",
        "yes",
    ])
    .is_err()
    {
        return Ok(format!(
            "Connected to {ssid}, but automatic reconnect could not be saved. Run kiosk network permission repair."
        ));
    }
    for old_uuid in old_profiles {
        // Names alone don't establish ownership: preserve user-created profiles
        // with the same display name, and profiles from earlier app versions.
        if run(&[
            "-g",
            "connection.stable-id",
            "connection",
            "show",
            "uuid",
            &old_uuid,
        ])
        .is_ok_and(|owner| owner.trim() == PROFILE_OWNER)
        {
            let _ = run(&["connection", "delete", "uuid", &old_uuid]);
        }
    }
    Ok(format!("Successfully connected to {ssid}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    const UUID: &str = "01900000-0000-7000-8000-000000000001";

    fn property<'a>(args: &'a [&str], key: &str) -> Option<&'a str> {
        args.windows(2)
            .find(|pair| pair[0] == key)
            .map(|pair| pair[1])
    }

    #[test]
    fn profiles_cover_all_personal_modes() {
        for (label, key, proto, pmf) in [
            ("WPA", "wpa-psk", Some("wpa"), "1"),
            ("WPA1", "wpa-psk", Some("wpa"), "1"),
            ("WPA1 WPA2", "wpa-psk", None, "2"),
            ("WPA2", "wpa-psk", Some("rsn"), "2"),
            ("WPA2 WPA3", "wpa-psk", Some("rsn"), "2"),
            ("WPA2/WPA3", "wpa-psk", Some("rsn"), "2"),
            ("WPA3", "sae", Some("rsn"), "3"),
            ("SAE", "sae", Some("rsn"), "3"),
            ("wpa3-personal", "sae", Some("rsn"), "3"),
        ] {
            let mut calls = Vec::new();
            connect_with("Lab", "test-password", label, UUID, |args| {
                calls.push(args.iter().map(|s| s.to_string()).collect::<Vec<_>>());
                Ok(String::new())
            })
            .unwrap();
            let add: Vec<_> = calls
                .iter()
                .find(|args| args.starts_with(&["connection".into(), "add".into()]))
                .unwrap()
                .iter()
                .map(String::as_str)
                .collect();
            assert_eq!(property(&add, "wifi-sec.key-mgmt"), Some(key), "{label}");
            assert_eq!(property(&add, "wifi-sec.proto"), proto, "{label}");
            assert_eq!(property(&add, "wifi-sec.pmf"), Some(pmf), "{label}");
            assert_eq!(property(&add, "connection.autoconnect"), Some("no"));
            assert_eq!(property(&add, "wifi-sec.psk-flags"), Some("0"));
            assert!(property(&add, "wifi-sec.pairwise").is_none());
            assert!(calls.iter().any(|args| args.starts_with(&[
                "connection".into(),
                "up".into(),
                "uuid".into(),
                UUID.into()
            ]) && args[4] == "passwd-file"));
            assert!(calls.iter().any(|args| args
                == &[
                    "connection",
                    "modify",
                    "uuid",
                    UUID,
                    "connection.autoconnect",
                    "yes"
                ]));
        }
    }

    #[test]
    fn rejects_unknown_and_enterprise_before_running_commands() {
        for label in [
            "",
            "Unknown",
            "WPA4",
            "WPA2 802.1X",
            "WPA3 Enterprise",
            "WPA-EAP",
            "WEP",
            "OWE",
        ] {
            assert!(connect_with("Lab", "password", label, UUID, |_| panic!(
                "must not run nmcli"
            ))
            .is_err());
        }
    }

    #[test]
    fn preserves_ssid_and_password_as_literal_arguments() {
        let ssid = " Lab:$()\\Room ";
        let password = " :$()\\'\" ";
        connect_with(ssid, password, "WPA3", UUID, |args| {
            if args.starts_with(&["connection", "add"]) {
                assert_eq!(property(args, "wifi.ssid"), Some(ssid));
                assert_eq!(property(args, "wifi-sec.psk"), Some(password));
            }
            Ok(String::new())
        })
        .unwrap();
    }

    #[test]
    fn open_profiles_do_not_contain_security_settings() {
        for label in ["Open", "open", "--", "none"] {
            connect_with("Lab", "", label, UUID, |args| {
                assert!(args.iter().all(|arg| !arg.starts_with("wifi-sec.")));
                Ok(String::new())
            })
            .unwrap();
        }
    }

    #[test]
    fn failed_activation_only_removes_the_new_profile() {
        let mut deleted = Vec::new();
        let result = connect_with("Lab", "password", "WPA3", UUID, |args| {
            if args.contains(&"UUID,NAME") {
                return Ok("old-uuid:Sourccey Wi-Fi - Lab\n".into());
            }
            if args.starts_with(&["connection", "up"]) {
                return Err("SAE authentication failed".into());
            }
            if args.starts_with(&["connection", "delete"]) {
                deleted.push(args[3].to_string());
            }
            Ok(String::new())
        });
        assert!(result.unwrap_err().contains("SAE authentication failed"));
        assert_eq!(deleted, [UUID]);
    }

    #[test]
    fn removes_only_owned_profiles_after_successful_activation() {
        let mut active = false;
        let mut deleted = Vec::new();
        connect_with("Lab", "password", "WPA2/WPA3", UUID, |args| {
            if args.contains(&"UUID,NAME") { return Ok("owned:Sourccey Wi-Fi - Lab\nuser:Sourccey Wi-Fi - Lab\nother:Sourccey Wi-Fi - Other\n".into()); }
            if args.starts_with(&["connection", "up"]) { active = true; }
            if args.contains(&"connection.stable-id") && args[0] == "-g" {
                return Ok(if args[5] == "owned" { PROFILE_OWNER } else { "user-owned" }.into());
            }
            if args.starts_with(&["connection", "delete"]) {
                assert!(active);
                deleted.push(args[3].to_string());
            }
            Ok(String::new())
        }).unwrap();
        assert_eq!(deleted, ["owned"]);
    }

    #[test]
    fn failed_profile_creation_never_activates_or_deletes_saved_profiles() {
        assert!(connect_with("Lab", "password", "WPA2", UUID, |args| {
            if args.contains(&"--active") {
                return Ok(String::new());
            }
            if args.contains(&"UUID,NAME") {
                return Ok("old:Sourccey Wi-Fi - Lab\n".into());
            }
            assert!(args.starts_with(&["connection", "add"]));
            Err("Not authorized".into())
        })
        .unwrap_err()
        .contains("Not authorized"));
    }

    #[test]
    fn hotspot_mode_is_not_a_station_connection_and_is_not_disconnected() {
        let error = connect_with("Lab", "password", "WPA2", UUID, |args| {
            if args.contains(&"--active") {
                return Ok("hotspot:802-11-wireless:wlan0\n".into());
            }
            assert_eq!(args[1], "802-11-wireless.mode");
            Ok("ap\n".into())
        })
        .unwrap_err();
        assert!(error.contains("Switch to Wi-Fi mode"));
    }

    #[test]
    fn failed_station_switch_restores_previous_connection() {
        let mut restored = false;
        let error = connect_with("Lab", "password", "WPA3", UUID, |args| {
            if args.contains(&"--active") {
                return Ok("previous:802-11-wireless:wlan0\n".into());
            }
            if args.contains(&"802-11-wireless.mode") {
                return Ok("infrastructure\n".into());
            }
            if args.starts_with(&["connection", "up", "uuid", UUID]) {
                return Err("wrong password".into());
            }
            if args == ["connection", "up", "uuid", "previous", "ifname", "wlan0"] {
                restored = true;
            }
            Ok(String::new())
        })
        .unwrap_err();
        assert!(restored);
        assert!(error.contains("wrong password"));
    }

    #[test]
    fn validates_password_and_ssid_without_side_effects() {
        for (ssid, password, security) in [
            ("", "password", "WPA2"),
            ("Lab", "", "WPA3"),
            ("Lab", "password", "Open"),
            ("Lab", "short", "WPA2"),
            ("Lab", "password\nsecond-line", "WPA3"),
            ("Lab", "password\0", "WPA3"),
            ("Lab\0", "password", "WPA2"),
        ] {
            assert!(connect_with(ssid, password, security, UUID, |_| panic!(
                "must not run nmcli"
            ))
            .is_err());
        }
        assert!(
            connect_with(&"a".repeat(33), "password", "WPA2", UUID, |_| panic!(
                "must not run nmcli"
            ))
            .is_err()
        );
    }

    #[test]
    fn activation_secret_is_explicit_private_and_removed_after_success_or_failure() {
        for fail in [false, true] {
            let mut path = None;
            let password = " literal:$()\\'\" ";
            let result = connect_with("Lab", password, "WPA3", UUID, |args| {
                if args.starts_with(&["connection", "up", "uuid", UUID]) {
                    assert_eq!(args[4], "passwd-file");
                    let secret = std::path::Path::new(args[5]);
                    assert_eq!(
                        std::fs::read_to_string(secret).unwrap(),
                        format!("802-11-wireless-security.psk:{password}\n")
                    );
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        assert_eq!(
                            std::fs::metadata(secret).unwrap().permissions().mode() & 0o777,
                            0o600
                        );
                    }
                    path = Some(secret.to_path_buf());
                    if fail {
                        return Err("Secrets were required, but not provided".into());
                    }
                }
                Ok(String::new())
            });
            assert_eq!(result.is_err(), fail);
            assert!(!path.unwrap().exists());
        }
    }

    #[test]
    fn system_diagnostics_are_not_user_errors() {
        for error in [
            "Warning: password for '802-11-wireless-security.psk' not given in 'passwd-file'. Error: Secrets were required, but not provided. Hint: journalctl -xe NM_CONNECTION=uuid",
            "Error: Connection activation failed: IP configuration could not be reserved (DHCP timeout)",
            "Error: NetworkManager is not running",
            "Error: unknown D-Bus failure",
        ] {
            let message = user_error(error.into());
            assert!(!message.contains("Warning:"));
            assert!(!message.contains("Error:"));
            assert!(!message.contains("journalctl"));
            assert!(!message.contains("D-Bus"));
        }
    }

    #[test]
    fn exports_offline_networkmanager_fixtures() {
        let Ok(path) = std::env::var("SOURCCEY_WIFI_FIXTURES") else {
            return;
        };
        let mut fixtures = Vec::new();
        for (label, password) in [
            ("WPA", "synthetic-password"),
            ("WPA1", "synthetic-password"),
            ("WPA2", "synthetic-password"),
            ("WPA1 WPA2", "synthetic-password"),
            ("WPA2 WPA3", "synthetic-password"),
            ("WPA2/WPA3", "synthetic-password"),
            ("WPA3", "synthetic-password"),
            ("SAE", "short"),
            (
                "WPA2",
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            ),
            ("Open", ""),
        ] {
            let security = classify_security(label).unwrap();
            let args = profile_args(
                "Lab:$()\\Room",
                password,
                UUID,
                "Sourccey Wi-Fi Test",
                &security,
            );
            fixtures.push(serde_json::json!({
                "label": label, "args": args, "uuid": UUID, "ssid": "Lab:$()\\Room",
                "password": password, "key_mgmt": security.key_mgmt, "pmf": security.pmf, "proto": security.proto,
            }));
        }
        std::fs::write(path, serde_json::to_vec_pretty(&fixtures).unwrap()).unwrap();
    }
}
