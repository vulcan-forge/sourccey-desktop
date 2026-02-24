// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![allow(unused_imports)]

// Import modules from the database folder
mod database;
use database::connection::DatabaseManager;
use tauri::Manager;
use services::setup::local_setup_service::{DesktopExtrasStatus, LocalSetupService, SetupStatus};

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
use modules::control::controllers::communication::ssh_controller::{
    init_ssh,
    init_robot_processes,
    connect,
    disconnect,
    is_connected,
    start_robot,
    stop_robot,
    is_robot_started
};
use modules::control::controllers::configuration::configuration_controller::{
    detect_config, read_config, read_remote_config, write_config, write_remote_config,
};
use modules::control::controllers::configuration::calibration_controller::{
    read_calibration, write_calibration, get_calibration_modified_at, auto_calibrate, remote_auto_calibrate,
};
use modules::control::controllers::kiosk_control::kiosk_host_controller::{
    get_pi_username, get_ssh_password_changed_status,
    get_system_info, init_kiosk_host, is_kiosk_host_active, set_pi_password,
    set_ssh_password_changed_status, start_kiosk_host, stop_kiosk_host,
};
use modules::control::controllers::kiosk_control::pairing_controller::{
    check_kiosk_robot_connection,
    get_kiosk_robot_status,
    discover_pairable_robots, get_kiosk_pairing_info, init_kiosk_pairing, pair_with_kiosk_robot,
    request_kiosk_pairing_modal, send_model_to_kiosk_robot, start_kiosk_robot, stop_kiosk_robot,
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
    set_access_point,
    is_access_point_active,
};
use modules::status::controllers::battery::battery_controller::get_battery_data;

use tauri_plugin_process::init;

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

fn is_kiosk_from_args() -> bool {
    std::env::args().any(|a| a == "--kiosk")
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

fn main() {
    // Default desktop; --kiosk enables kiosk mode
    let kiosk = is_kiosk_from_args();
    println!("kiosk_detected={}", kiosk);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            // Prefer bundled resources as project root when available
            if let Ok(app_data_dir) = app.path().app_data_dir() {
                if kiosk {
                    if let Ok(resource_dir) = app.path().resource_dir() {
                        DirectoryService::set_project_root_override(resource_dir);
                    }
                } else {
                    DirectoryService::set_project_root_override(app_data_dir);
                }
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
        .manage(init_ssh())
        .manage(init_robot_processes())
        .manage(init_teleop())
        .manage(init_remote_teleop())
        .manage(init_remote_inference())
        .manage(init_kiosk_host())
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

            // Control API SSH
            connect,
            disconnect,
            is_connected,
            start_robot,
            stop_robot,
            is_robot_started,

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
            setup_desktop_extras_check,
            setup_desktop_extras_run,

            // Kiosk Host Functions
            start_kiosk_host,
            stop_kiosk_host,
            is_kiosk_host_active,
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

            // WiFi API
            scan_wifi_networks,
            connect_to_wifi,
            get_current_wifi_connection,
            disconnect_from_wifi,
            set_wifi,
            set_access_point,
            is_access_point_active,

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
