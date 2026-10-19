use super::{
    DesktopEnvironmentService, DesktopEnvironmentSettings, SaveDesktopEnvironmentSettingsRequest,
    DEFAULT_LOCAL_DESKTOP_REST_API_URL, DEFAULT_LOCAL_DESKTOP_STUDIO_WEB_URL,
    DEFAULT_LOCAL_DESKTOP_UPDATER_MANIFEST_URL,
};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn test_file_path(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("{}_{}.json", name, suffix))
}

#[test]
fn default_settings_use_production_defaults() {
    let settings = DesktopEnvironmentService::default_settings();

    assert_eq!(settings.environment, "production");
    assert_eq!(settings.display_name, "Production");
    assert_eq!(settings.teleop_log_level, "warning");
    assert_eq!(
        settings.rest_api_url,
        "https://api.studio.vulcanrobotics.ai/v1"
    );
    assert_eq!(settings.studio_web_url, "https://studio.vulcanrobotics.ai");
    assert_eq!(
        settings.updater_manifest_url,
        "https://sourccey.nyc3.cdn.digitaloceanspaces.com/updater/latest.json"
    );
}

#[test]
fn normalize_url_accepts_missing_scheme() {
    assert_eq!(
        DesktopEnvironmentService::normalize_url("dev-box.local:5200/graphql").unwrap(),
        "http://dev-box.local:5200/graphql"
    );
}

#[test]
fn save_and_load_roundtrip_preserves_local_custom_urls() {
    let path = test_file_path("desktop_environment_roundtrip");
    let request = SaveDesktopEnvironmentSettingsRequest {
        environment: "local".to_string(),
        custom_rest_api_url: Some("dev-box.local:5200/v1".to_string()),
        custom_studio_web_url: Some("dev-box.local:3000".to_string()),
        custom_updater_manifest_url: Some("dev-box.local:3000/latest.json".to_string()),
        teleop_log_level: Some("error".to_string()),
    };

    let saved = DesktopEnvironmentService::save_settings_to_path(&path, request).unwrap();
    let loaded = DesktopEnvironmentService::get_settings_from_path(&path).unwrap();

    assert_eq!(saved.environment, "local");
    assert_eq!(saved.display_name, "Developer");
    assert_eq!(saved.badge_label.as_deref(), Some("DEV MODE"));
    assert_eq!(saved.teleop_log_level, "error");
    assert_eq!(loaded.rest_api_url, "http://dev-box.local:5200/v1");
    assert_eq!(loaded.studio_web_url, "http://dev-box.local:3000");
    assert_eq!(
        loaded.updater_manifest_url,
        "http://dev-box.local:3000/latest.json"
    );

    let _ = std::fs::remove_file(path);
}

#[test]
fn loading_missing_file_returns_default_settings() {
    let path = test_file_path("desktop_environment_missing");
    let settings = DesktopEnvironmentService::get_settings_from_path(&path).unwrap();

    assert_eq!(settings.environment, "production");
}

#[test]
fn non_local_persistence_uses_local_defaults_for_custom_fields() {
    let path = test_file_path("desktop_environment_staging");
    let saved = DesktopEnvironmentService::save_settings_to_path(
        &path,
        SaveDesktopEnvironmentSettingsRequest {
            environment: "staging".to_string(),
            custom_rest_api_url: Some("http://ignored/graphql".to_string()),
            custom_studio_web_url: Some("http://ignored.local:3000".to_string()),
            custom_updater_manifest_url: Some("http://ignored/latest.json".to_string()),
            teleop_log_level: None,
        },
    )
    .unwrap();

    assert_eq!(saved.environment, "staging");
    assert_eq!(saved.badge_label.as_deref(), Some("STAGING"));
    assert_eq!(
        saved.custom_rest_api_url,
        DEFAULT_LOCAL_DESKTOP_REST_API_URL
    );
    assert_eq!(
        saved.custom_studio_web_url,
        DEFAULT_LOCAL_DESKTOP_STUDIO_WEB_URL
    );
    assert_eq!(
        saved.custom_updater_manifest_url,
        DEFAULT_LOCAL_DESKTOP_UPDATER_MANIFEST_URL
    );

    let _ = std::fs::remove_file(path);
}

#[test]
fn updating_only_teleop_log_level_preserves_existing_local_urls() {
    let path = test_file_path("desktop_environment_log_level_only");

    DesktopEnvironmentService::save_settings_to_path(
        &path,
        SaveDesktopEnvironmentSettingsRequest {
            environment: "local".to_string(),
            custom_rest_api_url: Some("dev-box.local:5200/v1".to_string()),
            custom_studio_web_url: Some("dev-box.local:3000".to_string()),
            custom_updater_manifest_url: Some("dev-box.local:3000/latest.json".to_string()),
            teleop_log_level: Some("warning".to_string()),
        },
    )
    .unwrap();

    let updated = DesktopEnvironmentService::save_settings_to_path(
        &path,
        SaveDesktopEnvironmentSettingsRequest {
            environment: "local".to_string(),
            custom_rest_api_url: None,
            custom_studio_web_url: None,
            custom_updater_manifest_url: None,
            teleop_log_level: Some("error".to_string()),
        },
    )
    .unwrap();

    assert_eq!(updated.teleop_log_level, "error");
    assert_eq!(updated.rest_api_url, "http://dev-box.local:5200/v1");
    assert_eq!(updated.studio_web_url, "http://dev-box.local:3000");

    let _ = std::fs::remove_file(path);
}

#[test]
fn legacy_settings_migrate_without_losing_the_developer_host() {
    let path = test_file_path("desktop_environment_legacy_rest");
    std::fs::write(
        &path,
        r#"{
        "environment": "local",
        "custom_graphql_api_url": "dev-box.local:5200/v1/graphql/",
        "custom_studio_web_url": "http://dev-box.local:3000",
        "custom_updater_manifest_url": "http://dev-box.local:3000/latest.json",
        "teleop_log_level": "info"
    }"#,
    )
    .unwrap();
    let settings = DesktopEnvironmentService::get_settings_from_path(&path).unwrap();
    assert_eq!(settings.rest_api_url, "http://dev-box.local:5200/v1");
    assert_eq!(settings.website_api_url, settings.rest_api_url);
    assert_eq!(settings.teleop_log_level, "info");
    DesktopEnvironmentService::save_settings_to_path(
        &path,
        SaveDesktopEnvironmentSettingsRequest {
            environment: "local".to_string(),
            custom_rest_api_url: None,
            custom_studio_web_url: None,
            custom_updater_manifest_url: None,
            teleop_log_level: None,
        },
    )
    .unwrap();
    let persisted = std::fs::read_to_string(&path).unwrap();
    assert!(persisted.contains("custom_rest_api_url"));
    assert!(!persisted.contains("graphql"));
    let _ = std::fs::remove_file(path);
}

#[test]
fn rest_url_normalization_accepts_legacy_and_current_urls() {
    for input in [
        "https://host/v1/graphql/",
        "https://host/api/v1",
        "https://host/v1",
        "https://host",
    ] {
        assert_eq!(
            DesktopEnvironmentService::normalize_rest_api_url(input).unwrap(),
            "https://host/v1"
        );
    }
    assert_eq!(
        DesktopEnvironmentService::normalize_rest_api_url("http://host/proxy/v1/graphql").unwrap(),
        "http://host/proxy/v1"
    );
    assert!(DesktopEnvironmentService::normalize_rest_api_url("ftp://host/v1").is_err());
    let settings = DesktopEnvironmentService::default_settings();
    assert_eq!(settings.website_api_url, "https://api.vulcanrobotics.ai/v1");
}
