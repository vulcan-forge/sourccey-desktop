use super::{
    extract_version_core, is_kiosk_env_value, is_target_newer_version,
    parse_numeric_version_segments, parse_simple_version, SimpleVersion,
};

#[test]
fn kiosk_env_parser_accepts_expected_values() {
    assert!(is_kiosk_env_value("kiosk"));
    assert!(is_kiosk_env_value("KIOSK"));
    assert!(is_kiosk_env_value("true"));
    assert!(is_kiosk_env_value("1"));
    assert!(is_kiosk_env_value(" yes "));
}

#[test]
fn kiosk_env_parser_rejects_other_values() {
    assert!(!is_kiosk_env_value(""));
    assert!(!is_kiosk_env_value("desktop"));
    assert!(!is_kiosk_env_value("0"));
    assert!(!is_kiosk_env_value("false"));
}

#[test]
fn parses_plain_and_prefixed_versions() {
    assert_eq!(
        parse_simple_version("0.0.6"),
        Some(SimpleVersion {
            major: 0,
            minor: 0,
            patch: 6,
        })
    );
    assert_eq!(
        parse_simple_version("v1.2.3"),
        Some(SimpleVersion {
            major: 1,
            minor: 2,
            patch: 3,
        })
    );
    assert_eq!(parse_simple_version("bad"), None);
}

#[test]
fn extracts_and_parses_extended_version_formats() {
    assert_eq!(extract_version_core("version 0.0.13"), Some("0.0.13"));
    assert_eq!(
        parse_numeric_version_segments("0.0.13.0"),
        Some(vec![0, 0, 13, 0])
    );
}

#[test]
fn detects_newer_target_versions() {
    assert!(is_target_newer_version("0.0.5", "0.0.6"));
    assert!(!is_target_newer_version("0.0.6", "0.0.6"));
    assert!(!is_target_newer_version("0.0.7", "0.0.6"));
    assert!(!is_target_newer_version("0.0.13", "0.0.6"));
    assert!(!is_target_newer_version("0.0.13.0", "0.0.6"));
}
