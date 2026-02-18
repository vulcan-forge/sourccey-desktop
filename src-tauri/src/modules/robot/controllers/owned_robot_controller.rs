#![allow(dead_code)]

use crate::modules::robot::models::owned_robot::{
    ActiveOwnedRobot, OwnedRobot, OwnedRobotWithRelations,
};
use crate::modules::robot::services::owned_robot_service::OwnedRobotService;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize)]
pub struct AddOwnedRobotRequest {
    pub robot_id: String,
    pub nickname: Option<String>,
}

//----------------------------------------------------------//
// GET Robot Functions
//----------------------------------------------------------//
#[tauri::command]
pub async fn get_owned_robots(app_handle: AppHandle) -> Result<Vec<OwnedRobotWithRelations>, String> {
    let db_manager = match app_handle.try_state::<crate::database::connection::DatabaseManager>() {
        Some(manager) => manager,
        None => return Err("Database not initialized".to_string()),
    };

    let owned_robot_service = OwnedRobotService::new(db_manager.get_connection().clone());

    owned_robot_service
        .get_owned_robots()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_owned_robot_by_id(
    app_handle: AppHandle,
    id: String,
) -> Result<Option<OwnedRobotWithRelations>, String> {
    let db_manager = match app_handle.try_state::<crate::database::connection::DatabaseManager>() {
        Some(manager) => manager,
        None => return Err("Database not initialized".to_string()),
    };

    let owned_robot_service = OwnedRobotService::new(db_manager.get_connection().clone());

    owned_robot_service
        .get_owned_robot_by_id(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_owned_robot_by_nickname(
    app_handle: AppHandle,
    nickname: String,
) -> Result<Option<OwnedRobotWithRelations>, String> {
    let db_manager = match app_handle.try_state::<crate::database::connection::DatabaseManager>() {
        Some(manager) => manager,
        None => return Err("Database not initialized".to_string()),
    };

    let owned_robot_service = OwnedRobotService::new(db_manager.get_connection().clone());
    owned_robot_service
        .get_owned_robot_by_nickname(nickname)
        .await
        .map_err(|e| e.to_string())
}

//----------------------------------------------------------//
// CREATE Robot Functions
//----------------------------------------------------------//
#[tauri::command]
pub async fn add_owned_robot(
    app_handle: AppHandle,
    request: AddOwnedRobotRequest,
) -> Result<OwnedRobot, String> {
    let db_manager = match app_handle.try_state::<crate::database::connection::DatabaseManager>() {
        Some(manager) => manager,
        None => return Err("Database not initialized".to_string()),
    };

    let owned_robot_service = OwnedRobotService::new(db_manager.get_connection().clone());

    let mut active_owned_robot = ActiveOwnedRobot::new(request.robot_id);
    if let Some(nickname) = request.nickname {
        active_owned_robot = active_owned_robot.with_nickname(nickname);
    }

    owned_robot_service
        .add_owned_robot(active_owned_robot)
        .await
        .map_err(|e| e.to_string())
}

//----------------------------------------------------------//
// DELETE Robot Functions
//----------------------------------------------------------//
#[tauri::command]
pub async fn delete_owned_robot(app_handle: AppHandle, id: String) -> Result<(), String> {
    let db_manager = match app_handle.try_state::<crate::database::connection::DatabaseManager>() {
        Some(manager) => manager,
        None => return Err("Database not initialized".to_string()),
    };

    let owned_robot_service = OwnedRobotService::new(db_manager.get_connection().clone());
    owned_robot_service
        .delete_owned_robot(id)
        .await
        .map_err(|e| e.to_string())
}
