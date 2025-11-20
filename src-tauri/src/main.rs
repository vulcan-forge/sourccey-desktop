// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![allow(unused_imports)]

// Import modules from the database folder
mod database;
use database::connection::DatabaseManager;
use tauri::Manager;

// Import modules from the services folder
mod services;
use services::process::kiosk_process_service::KioskProcessService;

// Import modules from the utils folder
mod utils;
use utils::pagination::{PaginatedResponse, PaginationParameters};

// Import modules
mod modules;
use modules::ai::controllers::ai_models::ai_model_controller::{
    count_ai_models, count_all_ai_models, get_ai_model, get_ai_models, get_all_ai_models,
};
use modules::ai::controllers::dataset::v3::dataset_controller::{
    combine_datasets, count_all_datasets, count_datasets, get_all_datasets, get_dataset, get_datasets,
};
use modules::ai::controllers::dataset::v3::dataset_metadata_controller::{
    get_dataset_metadata, get_episode_metadata,
};
use modules::ai::controllers::dataset::v3::dataset_parquet_controller::{
    get_dataset_parquet_data, get_episode_parquet,
};
use modules::ai::controllers::dataset::v3::dataset_video_controller::{
    get_dataset_video_data, get_episode_video,
};
use modules::ai::controllers::training::training_controller::{
    init_training, start_training, stop_training, training_exists,
};
use modules::log::controllers::command_log_controller::{
    add_command_log, delete_all_command_logs, delete_command_log, get_command_log,
    get_command_logs_paginated, update_command_log,
};
use modules::profile::controllers::profile_controller::{
    create_profile, get_first_profile, get_profile_by_id,
};
use modules::robot::controllers::owned_robot_controller::{
    add_owned_robot, delete_owned_robot, get_owned_robot_by_id, get_owned_robot_by_nickname,
    get_owned_robots_by_profile,
};
use modules::robot::controllers::robot_controller::{get_all_robots, get_robot_by_id};
use modules::sync::controllers::sync_controller::{get_sync_status, sync_robots};

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
    read_calibration, write_calibration, auto_calibrate, remote_auto_calibrate,
};
use modules::control::controllers::kiosk_control::kiosk_host_controller::{
    get_active_kiosk_host_sessions, get_pi_username, get_ssh_password_changed_status,
    get_system_info, init_kiosk_host, is_kiosk_host_active, set_pi_password,
    set_ssh_password_changed_status, start_kiosk_host, stop_kiosk_host,
};
use modules::control::controllers::local_control::evaluate_controller::{
    init_evaluate, reset_evaluate_episode, save_evaluate_episode, start_evaluate, stop_evaluate,
};
use modules::control::controllers::local_control::record_controller::{
    init_record, reset_record_episode, save_record_episode, start_record, stop_record,
};
use modules::control::controllers::local_control::replay_controller::{
    init_replay, start_replay, stop_replay,
};
use modules::control::controllers::local_control::teleop_controller::{
    get_active_teleop_sessions, init_teleop, is_teleop_active, start_teleop, stop_teleop,
};
use modules::control::controllers::remote_control::remote_evaluate_controller::{
    init_remote_evaluate, reset_remote_evaluate_episode, save_remote_evaluate_episode,
    start_remote_evaluate, stop_remote_evaluate,
};
use modules::control::controllers::remote_control::remote_record_controller::{
    init_remote_record, reset_remote_record_episode, save_remote_record_episode,
    start_remote_record, stop_remote_record,
};
use modules::control::controllers::remote_control::remote_replay_controller::{
    init_remote_replay, start_remote_replay, stop_remote_replay,
};
use modules::control::controllers::remote_control::remote_teleop_controller::{
    init_remote_teleop, start_remote_teleop, stop_remote_teleop,
};
use modules::settings::controllers::wifi::wifi_controller::{
    connect_to_wifi, disconnect_from_wifi, get_current_wifi_connection, scan_wifi_networks,
    set_wifi,
};
use modules::settings::controllers::access_point::access_point_controller::{
    set_access_point,
};
use modules::status::controllers::battery::battery_controller::get_battery_data;

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

fn main() {
    // Default desktop; --kiosk enables kiosk mode
    let kiosk = is_kiosk_from_args();
    println!("kiosk_detected={}", kiosk);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
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
                } else {
                    let _ = win.set_fullscreen(false);
                    let _ = win.set_decorations(true);
                    let _ = win.set_resizable(true);
                    // Optional dev defaults:
                    // use tauri::window::{LogicalSize, Size};
                    // let _ = win.set_size(Size::Logical(LogicalSize{ width:1280.0, height:800.0 }));
                    // let _ = win.center();
                }
            }

            app.manage(AppMode(kiosk));

            // Start process monitor in kiosk mode (after app is initialized)
            if kiosk {
                let app_handle_for_monitor = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    println!("Starting process monitor for external sourccey_host detection...");
                    KioskProcessService::start_monitoring(app_handle_for_monitor);
                });
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
        .manage(init_record())
        .manage(init_training())
        .manage(init_replay())
        .manage(init_evaluate())
        .manage(init_remote_teleop())
        .manage(init_remote_record())
        .manage(init_remote_replay())
        .manage(init_remote_evaluate())
        .manage(init_kiosk_host())
        .invoke_handler(tauri::generate_handler![
            //----------------------------------------------------------//
            // File System Functionality
            //----------------------------------------------------------//

            // AI Model API
            get_all_ai_models,
            get_ai_models,
            get_ai_model,
            count_all_ai_models,
            count_ai_models,
            // Dataset API
            get_all_datasets,
            get_datasets,
            get_dataset,
            count_all_datasets,
            count_datasets,
            combine_datasets,
            // Dataset Metadata API
            get_dataset_metadata,
            get_episode_metadata,
            // Dataset Parquet API
            get_dataset_parquet_data,
            get_episode_parquet,
            // Dataset Video API
            get_dataset_video_data,
            get_episode_video,
            //----------------------------------------------------------//
            // Database Functionality
            //----------------------------------------------------------//

            // Profile API
            get_profile_by_id,
            get_first_profile,
            create_profile,
            // Robot API
            get_robot_by_id,
            get_all_robots,
            // Owned Robot API
            get_owned_robot_by_id,
            get_owned_robot_by_nickname,
            get_owned_robots_by_profile,
            add_owned_robot,
            delete_owned_robot,
            // Sync API
            sync_robots,
            get_sync_status,
            // Log API
            get_command_log,
            add_command_log,
            update_command_log,
            delete_command_log,
            delete_all_command_logs,
            get_command_logs_paginated,
            //----------------------------------------------------------//
            // Control Functionality
            //----------------------------------------------------------//

            // Control API
            // SSH
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
            auto_calibrate,
            remote_auto_calibrate,
            // Teleoperation Functions
            start_teleop,
            stop_teleop,
            is_teleop_active,
            get_active_teleop_sessions,
            start_remote_teleop,
            stop_remote_teleop,
            // Record Functions
            start_record,
            stop_record,
            save_record_episode,
            reset_record_episode,
            start_remote_record,
            stop_remote_record,
            save_remote_record_episode,
            reset_remote_record_episode,
            // Replay Functions
            start_replay,
            stop_replay,
            start_remote_replay,
            stop_remote_replay,
            // Evaluate Functions
            start_evaluate,
            stop_evaluate,
            save_evaluate_episode,
            reset_evaluate_episode,
            start_remote_evaluate,
            stop_remote_evaluate,
            save_remote_evaluate_episode,
            reset_remote_evaluate_episode,
            // Training Functions
            start_training,
            stop_training,
            training_exists,
            // App Mode
            get_app_mode,
            // Kiosk Host Functions
            start_kiosk_host,
            stop_kiosk_host,
            is_kiosk_host_active,
            get_active_kiosk_host_sessions,
            get_system_info,
            get_pi_username,
            set_pi_password,
            get_ssh_password_changed_status,
            set_ssh_password_changed_status,
            // WiFi API
            scan_wifi_networks,
            connect_to_wifi,
            get_current_wifi_connection,
            disconnect_from_wifi,
            set_wifi,
            set_access_point,
            // Battery API
            get_battery_data,
            // Store and cart functions removed

            // Debug API
            debug_check_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
