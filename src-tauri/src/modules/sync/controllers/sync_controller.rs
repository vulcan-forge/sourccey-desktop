use crate::modules::sync::services::sync_service::{CloudRobot, SyncResult, SyncService};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncRequest {
    pub robots: Vec<CloudRobot>,
}

#[tauri::command]
pub async fn sync_robots(
    app_handle: AppHandle,
    request: SyncRequest,
) -> Result<SyncResult, String> {
    println!("sync_robots called with {} robots", request.robots.len());

    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let sync_service = SyncService::new(db_manager.get_connection().clone());

    let result = sync_service.sync_robots(request.robots).await?;

    Ok(result)
}

#[tauri::command]
pub async fn get_sync_status(app_handle: AppHandle) -> Result<Option<serde_json::Value>, String> {
    println!("get_sync_status called");

    // Add error handling
    let db_manager = match app_handle.try_state::<crate::database::connection::DatabaseManager>() {
        Some(manager) => manager,
        None => return Err("Database not initialized".to_string()),
    };

    let sync_service = SyncService::new(db_manager.get_connection().clone());
    let status = sync_service.get_sync_status().await?;

    Ok(status.map(|s| serde_json::to_value(s).unwrap()))
}
