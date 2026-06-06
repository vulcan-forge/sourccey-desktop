use super::{KioskEnvironmentService, KioskEnvironmentSettings};

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
