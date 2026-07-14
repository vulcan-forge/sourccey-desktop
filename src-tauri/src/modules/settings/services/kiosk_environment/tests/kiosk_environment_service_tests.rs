use super::{
    KioskEnvironmentService, KioskEnvironmentSettings, SaveKioskEnvironmentSettingsRequest,
};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

fn test_file_path(name: &str) -> std::path::PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("{}_{}_kiosk_environment.json", name, nonce))
}

#[test]
fn local_urls_survive_environment_switches_and_reload() {
    let path = test_file_path("kiosk_environment_switch");
    let local_app_url = "http://test-computer.local:3000";
    let local_api_url = "http://test-computer.local:5200";

    KioskEnvironmentService::save_settings_to_path(
        &path,
        SaveKioskEnvironmentSettingsRequest {
            environment: "local".to_string(),
            custom_app_base_url: Some(local_app_url.to_string()),
            custom_api_base_url: Some(local_api_url.to_string()),
        },
    )
    .unwrap();

    let production = KioskEnvironmentService::save_settings_to_path(
        &path,
        SaveKioskEnvironmentSettingsRequest {
            environment: "production".to_string(),
            custom_app_base_url: None,
            custom_api_base_url: None,
        },
    )
    .unwrap();

    assert_eq!(production.custom_app_base_url, local_app_url);
    assert_eq!(production.custom_api_base_url, local_api_url);

    let reloaded = KioskEnvironmentService::get_settings_from_path(&path).unwrap();
    assert_eq!(reloaded.environment, "production");
    assert_eq!(reloaded.custom_app_base_url, local_app_url);
    assert_eq!(reloaded.custom_api_base_url, local_api_url);

    let local_again = KioskEnvironmentService::save_settings_to_path(
        &path,
        SaveKioskEnvironmentSettingsRequest {
            environment: "local".to_string(),
            custom_app_base_url: None,
            custom_api_base_url: None,
        },
    )
    .unwrap();

    assert_eq!(local_again.app_base_url, local_app_url);
    assert_eq!(local_again.api_base_url, local_api_url);

    let _ = fs::remove_file(path);
}

#[test]
fn storage_key_uses_fixed_names_for_hosted_environments() {
    let production = KioskEnvironmentSettings {
        environment: "production".to_string(),
        display_name: "Production".to_string(),
        badge_label: None,
        custom_app_base_url: "http://192.168.1.220:3000".to_string(),
        custom_api_base_url: "http://192.168.1.220:5200".to_string(),
        app_base_url: "https://studio.vulcanrobotics.ai".to_string(),
        api_base_url: "https://api.studio.vulcanrobotics.ai".to_string(),
    };
    let staging = KioskEnvironmentSettings {
        environment: "staging".to_string(),
        display_name: "Staging".to_string(),
        badge_label: Some("Staging".to_string()),
        custom_app_base_url: "http://192.168.1.220:3000".to_string(),
        custom_api_base_url: "http://192.168.1.220:5200".to_string(),
        app_base_url: "https://staging.factory.studio.vulcanrobotics.ai".to_string(),
        api_base_url: "https://api.staging.factory.studio.vulcanrobotics.ai".to_string(),
    };

    assert_eq!(
        KioskEnvironmentService::storage_key_for_settings(&production).unwrap(),
        "production"
    );
    assert_eq!(
        KioskEnvironmentService::storage_key_for_settings(&staging).unwrap(),
        "staging"
    );
}

#[test]
fn storage_key_normalizes_local_custom_host() {
    let local = KioskEnvironmentSettings {
        environment: "local".to_string(),
        display_name: "Local".to_string(),
        badge_label: Some("Local".to_string()),
        custom_app_base_url: "HTTP://Dev-Box.local:3000/".to_string(),
        custom_api_base_url: "HTTP://Dev-Box.local:5200/".to_string(),
        app_base_url: "http://Dev-Box.local:3000".to_string(),
        api_base_url: "http://Dev-Box.local:5200".to_string(),
    };

    assert_eq!(
        KioskEnvironmentService::storage_key_for_settings(&local).unwrap(),
        "local-app-http-dev-box-local-3000-api-http-dev-box-local-5200"
    );
    assert_eq!(
        KioskEnvironmentService::normalize_base_url("Dev-Box.local:5200").unwrap(),
        "http://dev-box.local:5200"
    );
}
