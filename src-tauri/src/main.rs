// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![allow(unused_imports)]

// Import modules from the database folder
mod database;
use database::connection::DatabaseManager;
use serde::Serialize;
use tauri::Manager;
use services::setup::local_setup_service::{DesktopExtrasStatus, LerobotUpdateStatus, LocalSetupService, SetupStatus};
use services::setup::kiosk_update_service::{KioskUpdateService, KioskUpdateStatus};

// Import modules from the services folder
mod services;
use services::directory::directory_service::DirectoryService;
use services::log::log_service::LogService;

// Import modules from the utils folder
mod utils;
use utils::pagination::{PaginatedResponse, PaginationParameters};

// Import modules
mod modules;
use modules::log::controllers::command_log_controller::{
    add_command_log, delete_all_command_logs, delete_command_log, get_command_log,
    get_command_logs_paginated, update_command_log,
};
use modules::robot::controllers::owned_robot_controller::{
    add_owned_robot, delete_owned_robot, get_owned_robot_by_id, get_owned_robot_by_nickname,
    get_owned_robots,
};
use modules::robot::controllers::robot_controller::{get_all_robots, get_robot_by_id, upsert_robot_template};

// Import Robotics Control Modules
use modules::control::controllers::configuration::configuration_controller::{
    detect_config, read_config, read_remote_config, write_config, write_remote_config,
};
use modules::control::controllers::configuration::calibration_controller::{
    read_calibration, write_calibration, get_calibration_modified_at, auto_calibrate, remote_auto_calibrate,
    desktop_get_teleop_calibration_status, desktop_auto_calibrate_teleoperator,
};
use modules::control::controllers::kiosk_control::kiosk_host_controller::{
    get_pi_username, get_ssh_password_changed_status,
    get_system_info, init_kiosk_host, is_kiosk_host_active, set_pi_password,
    set_ssh_password_changed_status, start_kiosk_host, stop_kiosk_host,
};
use modules::control::controllers::kiosk_control::manual_drive_controller::{
    init_kiosk_manual_drive, set_kiosk_manual_drive_keys, start_kiosk_manual_drive,
    stop_kiosk_manual_drive,
};
use modules::control::controllers::kiosk_control::pairing_controller::{
    check_kiosk_robot_connection,
    get_kiosk_robot_status,
    discover_pairable_robots, get_kiosk_pairing_info, init_kiosk_pairing, pair_with_kiosk_robot,
    request_kiosk_pairing_modal, send_model_to_kiosk_robot, start_kiosk_robot, stop_kiosk_robot,
    get_saved_paired_robot_connections, upsert_paired_robot_connection, remove_paired_robot_connection,
};
use modules::control::services::kiosk_control::pairing_service::{
    KioskPairingService, KioskPairingState,
};
use modules::control::controllers::local_control::teleop_controller::{
    get_active_teleop_sessions, init_teleop, is_teleop_active, start_teleop, stop_teleop,
};
use modules::control::controllers::remote_control::remote_teleop_controller::{
    init_remote_teleop, start_remote_teleop, stop_remote_teleop,
};
use modules::control::controllers::remote_control::remote_inference_controller::{
    init_remote_inference, start_remote_inference, stop_remote_inference,
};
use modules::ai_model::controllers::ai_model_controller::{
    add_ai_model, delete_ai_model, download_ai_model_from_huggingface, get_ai_model,
    get_ai_model_cache_path, get_ai_models_paginated, sync_ai_models_from_cache, update_ai_model,
};
use modules::settings::controllers::wifi::wifi_controller::{
    connect_to_wifi, disconnect_from_wifi, get_current_wifi_connection, scan_wifi_networks,
    set_wifi,
};
use modules::settings::controllers::access_point::access_point_controller::{
    get_access_point_credentials, save_access_point_credentials, set_access_point,
    is_access_point_active,
};
use modules::status::controllers::battery::battery_controller::get_battery_data;

use tauri_plugin_process::init;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopUpdateStatus {
    update_available: bool,
    current_version: Option<String>,
    target_version: Option<String>,
    release_notes: Option<String>,
    parity_passed: bool,
    force: bool,
    error: Option<String>,
}

#[derive(Debug, Clone, Copy, Eq, Ord, PartialEq, PartialOrd)]
struct SimpleVersion {
    major: u64,
    minor: u64,
    patch: u64,
}

fn parse_simple_version(value: &str) -> Option<SimpleVersion> {
    let normalized = value.trim().trim_start_matches('v');
    let core = normalized
        .split(['-', '+'])
        .next()
        .unwrap_or(normalized)
        .trim();
    if core.is_empty() {
        return None;
    }

    let mut parts = core.split('.');
    let major = parts.next()?.parse::<u64>().ok()?;
    let minor = parts.next()?.parse::<u64>().ok()?;
    let patch = parts.next()?.parse::<u64>().ok()?;
    if parts.next().is_some() {
        return None;
    }

    Some(SimpleVersion {
        major,
        minor,
        patch,
    })
}

fn is_target_newer_version(current: &str, target: &str) -> bool {
    match (parse_simple_version(current), parse_simple_version(target)) {
        (Some(current_version), Some(target_version)) => target_version > current_version,
        _ => target.trim() != current.trim(),
    }
}

fn read_force_flag_from_manifest(value: &serde_json::Value, target_version: &str) -> bool {
    let manifest_version = value.get("version").and_then(|v| v.as_str()).unwrap_or_default();
    if manifest_version != target_version {
        return false;
    }

    value.get("force").and_then(|v| v.as_bool()).unwrap_or(false)
}

fn resolve_updater_manifest_url() -> String {
    std::env::var("SOURCCEY_UPDATER_URL")
        .unwrap_or_else(|_| "https://sourccey.nyc3.cdn.digitaloceanspaces.com/updater/latest.json".to_string())
}

fn read_manifest_target_version(value: &serde_json::Value) -> Option<String> {
    value
        .get("version")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn read_manifest_release_notes(value: &serde_json::Value) -> Option<String> {
    value
        .get("notes")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

async fn read_updater_manifest() -> Result<serde_json::Value, String> {
    let url = resolve_updater_manifest_url();
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch updater manifest from {}: {}", url, e))?;
    if !response.status().is_success() {
        return Err(format!(
            "Updater manifest request to {} returned HTTP {}",
            url,
            response.status()
        ));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse updater manifest from {}: {}", url, e))
}

#[tauri::command]
async fn desktop_update_check(app: tauri::AppHandle) -> Result<DesktopUpdateStatus, String> {
    let current_version = app.package_info().version.to_string();
    let (manifest, manifest_error) = match read_updater_manifest().await {
        Ok(value) => (Some(value), None),
        Err(error) => {
            eprintln!("{}", error);
            (None, Some(error))
        }
    };
    let manifest_target_version = manifest.as_ref().and_then(read_manifest_target_version);
    let manifest_update_available = manifest_target_version
        .as_deref()
        .map(|target| is_target_newer_version(&current_version, target))
        .unwrap_or(false);
    let manifest_force = match (manifest.as_ref(), manifest_target_version.as_deref()) {
        (Some(value), Some(target)) => read_force_flag_from_manifest(value, target),
        _ => false,
    };
    let manifest_release_notes = manifest.as_ref().and_then(read_manifest_release_notes);

    Ok(DesktopUpdateStatus {
        update_available: manifest_update_available,
        current_version: Some(current_version),
        target_version: manifest_target_version,
        release_notes: manifest_release_notes,
        parity_passed: true,
        force: manifest_force,
        error: manifest_error,
    })
}

#[tauri::command]
async fn debug_check_updates(app: tauri::AppHandle) -> Result<String, String> {
    println!("🔍 Debug: Starting update check...");

    // In Tauri v2, we need to use the updater plugin differently
    // The updater plugin provides a check function that we can call
    use tauri_plugin_updater::UpdaterExt;

    match app.updater() {
        Ok(updater) => {
            println!("🔍 Debug: Updater obtained successfully, checking for updates...");

            // Try to get more detailed error information
            match updater.check().await {
                Ok(update) => {
                    if let Some(update) = update {
                        println!("✅ Debug: Update found: {}", update.version);
                        Ok(format!("Update found: {}", update.version))
                    } else {
                        println!("ℹ️ Debug: No updates available");
                        Ok("No updates available".to_string())
                    }
                }
                Err(e) => {
                    println!("❌ Debug: Update check failed: {}", e);
                    println!("❌ Debug: Error details: {:?}", e);

                    // Try to provide more context about the error
                    let error_msg = format!("Update check failed: {}\n\nPossible causes:\n- Network connectivity issues\n- GitHub API rate limiting\n- SSL certificate problems\n- Corporate firewall blocking requests\n- Missing User-Agent headers", e);
                    Err(error_msg)
                }
            }
        }
        Err(e) => {
            println!("❌ Debug: Failed to get updater: {}", e);
            Err(format!("Failed to get updater: {}", e))
        }
    }
}

#[derive(Clone)]
struct AppMode(pub bool); // true = kiosk

fn is_kiosk_env_value(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    matches!(normalized.as_str(), "1" | "true" | "yes" | "kiosk")
}

fn is_kiosk_from_env() -> bool {
    std::env::var("SOURCCEY_APP_MODE")
        .map(|value| is_kiosk_env_value(&value))
        .unwrap_or(false)
}

fn is_kiosk_from_args() -> bool {
    is_kiosk_from_env() || std::env::args().any(|a| a == "--kiosk")
}

#[tauri::command]
fn get_app_mode(state: tauri::State<AppMode>) -> bool {
    state.0
}

fn resolve_log_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .or_else(|_| DirectoryService::get_current_dir())
        .map_err(|e| format!("Failed to resolve log directory: {}", e))?;
    let log_dir = base_dir.join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|e| format!("Failed to create log dir: {}", e))?;
    Ok(log_dir)
}

fn frontend_log_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(resolve_log_dir(app)?.join("frontend.log"))
}

#[tauri::command]
fn get_log_dir(app: tauri::AppHandle) -> Result<String, String> {
    let log_dir = resolve_log_dir(&app)?;
    Ok(log_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn get_lerobot_vulcan_dir() -> Result<String, String> {
    let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
    Ok(lerobot_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn write_frontend_log(app: tauri::AppHandle, level: String, message: String) -> Result<(), String> {
    let log_path = frontend_log_path(&app)?;
    let prefix = format!("frontend/{}", level);
    LogService::write_log_line(log_path.to_string_lossy().as_ref(), Some(&prefix), &message);
    Ok(())
}

#[tauri::command]
fn get_frontend_log_tail(app: tauri::AppHandle, max_lines: Option<usize>) -> Result<Vec<String>, String> {
    let log_path = frontend_log_path(&app)?;
    let limit = max_lines.unwrap_or(200).clamp(1, 1000);
    LogService::read_log_tail(log_path.to_string_lossy().as_ref(), limit)
}

#[tauri::command]
fn get_log_tail_all(
    app: tauri::AppHandle,
    max_lines: Option<usize>,
    max_lines_per_file: Option<usize>,
) -> Result<Vec<String>, String> {
    let log_dir = resolve_log_dir(&app)?;
    let limit = max_lines.unwrap_or(400).clamp(1, 2000);
    let per_file = max_lines_per_file.unwrap_or(200).clamp(1, 1000);
    LogService::read_log_tail_all(&log_dir, limit, per_file)
}

#[tauri::command]
fn clear_log_dir(app: tauri::AppHandle) -> Result<usize, String> {
    let log_dir = resolve_log_dir(&app)?;
    LogService::clear_log_dir(&log_dir)
}

#[tauri::command]
async fn setup_check(app: tauri::AppHandle) -> Result<SetupStatus, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || LocalSetupService::check_status(&app_handle))
        .await
        .map_err(|e| format!("Setup task failed: {}", e))?
}

#[tauri::command]
async fn setup_run(app: tauri::AppHandle, force: Option<bool>) -> Result<(), String> {
    let app_handle = app.clone();
    let force = force.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || LocalSetupService::run_setup(&app_handle, force))
        .await
        .map_err(|e| format!("Setup task failed: {}", e))?
}

#[tauri::command]
async fn setup_reset(app: tauri::AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || LocalSetupService::reset_modules(&app_handle))
        .await
        .map_err(|e| format!("Setup task failed: {}", e))?
}

#[tauri::command]
async fn setup_desktop_extras_check(app: tauri::AppHandle) -> Result<DesktopExtrasStatus, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || LocalSetupService::check_desktop_extras(&app_handle))
        .await
        .map_err(|e| format!("Setup task failed: {}", e))?
}

#[tauri::command]
async fn setup_desktop_extras_run(app: tauri::AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || LocalSetupService::run_desktop_extras(&app_handle))
        .await
        .map_err(|e| format!("Setup task failed: {}", e))?
}

#[tauri::command]
async fn check_lerobot_update(app: tauri::AppHandle) -> Result<LerobotUpdateStatus, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || LocalSetupService::check_lerobot_update(&app_handle))
        .await
        .map_err(|e| format!("Setup task failed: {}", e))?
}

#[tauri::command]
async fn kiosk_setup_repair(app: tauri::AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || KioskUpdateService::repair_lerobot(&app_handle))
        .await
        .map_err(|e| format!("Kiosk repair task failed: {}", e))?
}

#[tauri::command]
async fn kiosk_setup_update(app: tauri::AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || KioskUpdateService::update_kiosk(&app_handle))
        .await
        .map_err(|e| format!("Kiosk update task failed: {}", e))?
}

#[tauri::command]
async fn kiosk_update_check(app: tauri::AppHandle) -> Result<KioskUpdateStatus, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || KioskUpdateService::check_updates(&app_handle))
        .await
        .map_err(|e| format!("Kiosk update check failed: {}", e))?
}

fn main() {
    // Default desktop; --kiosk enables kiosk mode
    let kiosk = is_kiosk_from_args();
    println!("kiosk_detected={}", kiosk);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            // Prefer fixed repo path for kiosk to avoid env vars on low-resource devices.
            if kiosk {
                DirectoryService::set_project_root_override(
                    services::directory::path_constants::get_project_root(),
                );
            } else if let Ok(app_data_dir) = app.path().app_data_dir() {
                DirectoryService::set_project_root_override(app_data_dir);
            }
            // Database initialization
            let app_handle = app.handle();
            tauri::async_runtime::block_on(async {
                match DatabaseManager::new(&app_handle).await {
                    Ok(db_manager) => {
                        println!("Database initialized successfully");
                        app_handle.manage(db_manager);
                        println!("Database manager added to app state");
                    }
                    Err(e) => eprintln!("Failed to initialize database: {}", e),
                }
            });

            // Apply window policy based on kiosk flag
            if let Some(win) = app.get_webview_window("main") {
                if kiosk {
                    let _ = win.set_fullscreen(true);
                    let _ = win.set_decorations(false);
                    let _ = win.set_resizable(false);
                    let _ = win.set_cursor_visible(false);
                } else {
                    let _ = win.set_fullscreen(false);
                    let _ = win.set_decorations(true);
                    let _ = win.set_resizable(true);
                    let _ = win.set_cursor_visible(true);
                    // Optional dev defaults:
                    // use tauri::window::{LogicalSize, Size};
                    // let _ = win.set_size(Size::Logical(LogicalSize{ width:1280.0, height:800.0 }));
                    // let _ = win.center();
                }
            }

            app.manage(AppMode(kiosk));

            // Start process monitor in kiosk mode (after app is initialized)
            if kiosk {
                KioskPairingService::register_kiosk_runtime(app.handle().clone());
                let pairing_state = app.state::<KioskPairingState>().inner().clone();
                if let Err(e) = KioskPairingService::start_kiosk_pairing_network(pairing_state) {
                    eprintln!("Failed to start kiosk pairing network: {}", e);
                }
            }

            Ok(())
        })
        // Only block close in kiosk mode
        .on_window_event(move |_, event| {
            if kiosk {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                }
            }
        })
        // Initialize all services
        .manage(init_teleop())
        .manage(init_remote_teleop())
        .manage(init_remote_inference())
        .manage(init_kiosk_host())
        .manage(init_kiosk_manual_drive())
        .manage(init_kiosk_pairing())
        .invoke_handler(tauri::generate_handler![
            //----------------------------------------------------------//
            // Log API
            //----------------------------------------------------------//
            get_command_log,
            add_command_log,
            update_command_log,
            delete_command_log,
            delete_all_command_logs,
            get_command_logs_paginated,

            //----------------------------------------------------------//
            // Robot API
            //----------------------------------------------------------//
            get_robot_by_id,
            get_all_robots,
            upsert_robot_template,

            //----------------------------------------------------------//
            // Owned Robot API
            //----------------------------------------------------------//
            get_owned_robot_by_id,
            get_owned_robot_by_nickname,
            get_owned_robots,
            add_owned_robot,
            delete_owned_robot,

            //----------------------------------------------------------//
            // Control Functionality
            //----------------------------------------------------------//

            // Configuration
            read_config,
            write_config,
            detect_config,

            // Remote Configuration
            read_remote_config,
            write_remote_config,

            // Calibration
            read_calibration,
            write_calibration,
            get_calibration_modified_at,
            auto_calibrate,
            remote_auto_calibrate,
            desktop_get_teleop_calibration_status,
            desktop_auto_calibrate_teleoperator,

            // Teleoperation Functions
            start_teleop,
            stop_teleop,
            is_teleop_active,
            get_active_teleop_sessions,
            start_remote_teleop,
            stop_remote_teleop,
            start_remote_inference,
            stop_remote_inference,

            // App Mode
            get_app_mode,
            get_log_dir,
            get_lerobot_vulcan_dir,
            write_frontend_log,
            get_frontend_log_tail,
            get_log_tail_all,
            clear_log_dir,
            setup_check,
            setup_run,
            setup_reset,
            setup_desktop_extras_check,
            setup_desktop_extras_run,
            check_lerobot_update,
            desktop_update_check,
            kiosk_setup_repair,
            kiosk_setup_update,
            kiosk_update_check,

            // Kiosk Host Functions
            start_kiosk_host,
            stop_kiosk_host,
            is_kiosk_host_active,
            start_kiosk_manual_drive,
            set_kiosk_manual_drive_keys,
            stop_kiosk_manual_drive,
            get_system_info,
            get_pi_username,
            set_pi_password,
            get_ssh_password_changed_status,
            set_ssh_password_changed_status,

            // Pairing + model dispatch
            get_kiosk_pairing_info,
            discover_pairable_robots,
            pair_with_kiosk_robot,
            request_kiosk_pairing_modal,
            send_model_to_kiosk_robot,
            check_kiosk_robot_connection,
            start_kiosk_robot,
            stop_kiosk_robot,
            get_kiosk_robot_status,
            get_saved_paired_robot_connections,
            upsert_paired_robot_connection,
            remove_paired_robot_connection,

            // WiFi API
            scan_wifi_networks,
            connect_to_wifi,
            get_current_wifi_connection,
            disconnect_from_wifi,
            set_wifi,
            set_access_point,
            is_access_point_active,
            get_access_point_credentials,
            save_access_point_credentials,

            // Battery API
            get_battery_data,

            // Store and cart functions removed

            // Debug API
            debug_check_updates,

            // AI Model API
            add_ai_model,
            get_ai_model,
            update_ai_model,
            delete_ai_model,
            get_ai_models_paginated,
            sync_ai_models_from_cache,
            download_ai_model_from_huggingface,
            get_ai_model_cache_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod app_mode_tests {
    use super::is_kiosk_env_value;

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
}

#[cfg(test)]
mod version_compare_tests {
    use super::{is_target_newer_version, parse_simple_version, SimpleVersion};

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
    fn detects_newer_target_versions() {
        assert!(is_target_newer_version("0.0.5", "0.0.6"));
        assert!(!is_target_newer_version("0.0.6", "0.0.6"));
        assert!(!is_target_newer_version("0.0.7", "0.0.6"));
    }
}
