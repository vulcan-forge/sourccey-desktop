use super::KioskManualDriveService;
use super::KioskManualDriveService as Service;

#[test]
fn sanitize_pressed_keys_filters_unknown_dedupes_and_sorts() {
    let keys = vec![
        "w".to_string(),
        "A".to_string(),
        "invalid".to_string(),
        "w".to_string(),
        " z ".to_string(),
        "q".to_string(),
    ];

    let sanitized = Service::sanitize_pressed_keys(keys);
    assert_eq!(
        sanitized,
        vec!["a".to_string(), "q".to_string(), "w".to_string(), "z".to_string()]
    );
}

#[test]
fn build_control_payload_contains_nickname_and_keys() {
    let payload = Service::build_control_payload(
        "sourccey",
        vec!["a".to_string(), "w".to_string()],
    )
    .expect("payload should serialize");

    let parsed: serde_json::Value = serde_json::from_str(&payload).expect("valid JSON payload");
    assert_eq!(parsed["nickname"], "sourccey");
    assert_eq!(
        parsed["pressed_keys"],
        serde_json::json!(["a", "w"])
    );
    assert!(parsed["sent_at_ms"].as_u64().is_some());
}

#[test]
fn normalize_nickname_trims_and_removes_at_prefix() {
    let normalized = Service::normalize_nickname("  @Sourccey  ").expect("nickname should normalize");
    assert_eq!(normalized, "Sourccey".to_string());
}

#[test]
fn normalize_nickname_rejects_invalid_values() {
    assert!(Service::normalize_nickname(" ").is_err());
    assert!(Service::normalize_nickname("bad/name").is_err());
    assert!(Service::normalize_nickname("bad\\name").is_err());
    assert!(Service::normalize_nickname("bad\nname").is_err());
}

#[test]
fn build_command_args_contains_expected_defaults() {
    let args = Service::build_command_args("sourccey");
    assert_eq!(args[1], "-u".to_string());
    assert_eq!(
        args[2],
        "src/lerobot/control/sourccey/sourccey/manual_drive_bridge.py".to_string()
    );
    assert!(args.iter().any(|arg| arg == "--id=sourccey"));
    assert!(args.iter().any(|arg| arg == "--remote_ip=127.0.0.1"));
    assert!(args.iter().any(|arg| arg.starts_with("--udp_port=")));
    assert!(args.iter().any(|arg| arg == "--fps=30"));
}

#[test]
fn set_keys_returns_error_when_bridge_not_running() {
    let state = KioskManualDriveService::init_kiosk_manual_drive();
    let result = KioskManualDriveService::set_kiosk_manual_drive_keys(
        &state,
        "sourccey".to_string(),
        vec!["w".to_string()],
    );
    assert!(result.is_err());
}

#[test]
fn stop_without_process_is_safe() {
    let state = KioskManualDriveService::init_kiosk_manual_drive();
    let result = KioskManualDriveService::stop_kiosk_manual_drive(&state, "sourccey".to_string());
    assert!(result.is_ok());
    let message = result.unwrap_or_default();
    assert!(message.contains("not running"));
}
