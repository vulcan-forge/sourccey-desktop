use crate::modules::robot::models::robot::Robot;
use crate::modules::robot::services::robot_service::RobotService;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn get_robot_by_id(app_handle: AppHandle, id: String) -> Result<Option<Robot>, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let robot_service = RobotService::new(db_manager.get_connection().clone());

    robot_service
        .get_robot_by_id(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_robots(app_handle: AppHandle) -> Result<Vec<Robot>, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let robot_service = RobotService::new(db_manager.get_connection().clone());

    robot_service
        .get_all_robots()
        .await
        .map_err(|e| e.to_string())
}
