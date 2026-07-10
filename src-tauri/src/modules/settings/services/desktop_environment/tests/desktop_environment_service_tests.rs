use super::{
    DesktopEnvironmentService, DesktopEnvironmentSettings,
    SaveDesktopEnvironmentSettingsRequest, DEFAULT_LOCAL_DESKTOP_GRAPHQL_API_URL,
    DEFAULT_LOCAL_DESKTOP_STUDIO_WEB_URL, DEFAULT_LOCAL_DESKTOP_UPDATER_MANIFEST_URL,
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
        settings.graphql_api_url,
        "https://api.studio.vulcanrobotics.ai/v1/graphql"
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
        custom_graphql_api_url: Some("dev-box.local:5200/v1/graphql".to_string()),
        custom_studio_web_url: Some("dev-box.local:3000".to_string()),
        custom_updater_manifest_url: Some("dev-box.local:3000/latest.json".to_string()),
        teleop_log_level: Some("error".to_string()),
    };

    let saved =
        DesktopEnvironmentService::save_settings_to_path(&path, request).unwrap();
    let loaded = DesktopEnvironmentService::get_settings_from_path(&path).unwrap();

    assert_eq!(saved.environment, "local");
    assert_eq!(saved.display_name, "Developer");
    assert_eq!(saved.badge_label.as_deref(), Some("DEV MODE"));
    assert_eq!(saved.teleop_log_level, "error");
    assert_eq!(loaded.graphql_api_url, "http://dev-box.local:5200/v1/graphql");
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
            custom_graphql_api_url: Some("http://ignored/graphql".to_string()),
            custom_studio_web_url: Some("http://ignored.local:3000".to_string()),
            custom_updater_manifest_url: Some("http://ignored/latest.json".to_string()),
            teleop_log_level: None,
        },
    )
    .unwrap();

    assert_eq!(saved.environment, "staging");
    assert_eq!(saved.badge_label.as_deref(), Some("STAGING"));
    assert_eq!(
        saved.custom_graphql_api_url,
        DEFAULT_LOCAL_DESKTOP_GRAPHQL_API_URL
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
            custom_graphql_api_url: Some("dev-box.local:5200/v1/graphql".to_string()),
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
            custom_graphql_api_url: None,
            custom_studio_web_url: None,
            custom_updater_manifest_url: None,
            teleop_log_level: Some("error".to_string()),
        },
    )
    .unwrap();

    assert_eq!(updated.teleop_log_level, "error");
    assert_eq!(updated.graphql_api_url, "http://dev-box.local:5200/v1/graphql");
    assert_eq!(updated.studio_web_url, "http://dev-box.local:3000");

    let _ = std::fs::remove_file(path);
}
