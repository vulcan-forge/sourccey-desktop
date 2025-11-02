#![allow(dead_code)]

use crate::modules::log::models::command_log::CommandLog;
use crate::modules::log::services::command_log_service::{
    CommandLogFilters, CommandLogService, CommandLogWithRobot,
};
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

//-------------------------------------------------------------------------//
// Get Command Log
//-------------------------------------------------------------------------//
#[tauri::command]
pub async fn get_command_log(
    app_handle: AppHandle,
    id: String,
) -> Result<Option<CommandLog>, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let command_log_service = CommandLogService::new(db_manager.get_connection().clone());

    let command_log = command_log_service
        .get_command_log(id)
        .await
        .map_err(|e| e.to_string())?;
    return Ok(command_log);
}

//-------------------------------------------------------------------------//
// Add Command Log
//-------------------------------------------------------------------------//
#[tauri::command]
pub async fn add_command_log(
    app_handle: AppHandle,
    command_log: CommandLog,
) -> Result<CommandLog, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let command_log_service = CommandLogService::new(db_manager.get_connection().clone());

    let command_log = command_log_service
        .add_command_log(command_log.into())
        .await
        .map_err(|e| e.to_string())?;
    return Ok(command_log);
}

//-------------------------------------------------------------------------//
// Update Command Log
//-------------------------------------------------------------------------//
#[tauri::command]
pub async fn update_command_log(
    app_handle: AppHandle,
    command_log: CommandLog,
) -> Result<CommandLog, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let command_log_service = CommandLogService::new(db_manager.get_connection().clone());
    let command_log = command_log_service
        .update_command_log(command_log.into())
        .await
        .map_err(|e| e.to_string())?;
    return Ok(command_log);
}

//-------------------------------------------------------------------------//
// Delete Command Log
//-------------------------------------------------------------------------//
#[tauri::command]
pub async fn delete_command_log(app_handle: AppHandle, id: String) -> Result<bool, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let command_log_service = CommandLogService::new(db_manager.get_connection().clone());
    command_log_service
        .delete_command_log(id)
        .await
        .map_err(|e| e.to_string())?;
    return Ok(true);
}

#[tauri::command]
pub async fn delete_all_command_logs(app_handle: AppHandle) -> Result<bool, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let command_log_service = CommandLogService::new(db_manager.get_connection().clone());
    command_log_service
        .delete_all_command_logs()
        .await
        .map_err(|e| e.to_string())?;
    return Ok(true);
}

//-------------------------------------------------------------------------//
// Get Command Logs Paginated
//-------------------------------------------------------------------------//
#[tauri::command]
pub async fn get_command_logs_paginated(
    app_handle: AppHandle,
    filters: CommandLogFilters,
    pagination: PaginationParameters,
) -> Result<PaginatedResponse<CommandLogWithRobot>, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let command_log_service = CommandLogService::new(db_manager.get_connection().clone());

    let command_logs = command_log_service
        .get_command_logs_paginated(filters, pagination)
        .await
        .map_err(|e| {
            println!("Error in service: {}", e);
            e.to_string()
        })?;

    return Ok(command_logs);
}
