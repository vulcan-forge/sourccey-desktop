use crate::modules::control::services::configuration::calibration_service::CalibrationService;
use crate::modules::control::types::configuration::calibration_types::{
    Calibration,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use std::collections::HashMap;

//----------------------------------------------------------//
// Calibration Functions
//----------------------------------------------------------//
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CalibrationConfig {
    pub nickname: String,
    pub robot_type: String,
    pub teleop_type: String,
    pub robot_port: String,
    pub teleop_port: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteCalibrationConfig {
    pub nickname: String,
    pub robot_type: String,
    pub full_reset: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DesktopTeleopCalibrationConfig {
    pub nickname: String,
    pub teleop_type: String,
    pub left_arm_port: String,
    pub right_arm_port: String,
    pub full_reset: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DesktopTeleopCalibrationStatusConfig {
    pub nickname: String,
    pub teleop_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DesktopTeleopCalibrationStatus {
    pub is_calibrated: bool,
    pub left_calibrated: bool,
    pub right_calibrated: bool,
    pub modified_at: Option<u64>,
    pub calibration_path: Option<String>,
}

#[tauri::command]
pub fn read_calibration(robot_type: String, nickname: String) -> Result<(Calibration, bool), String> {
    let (calibration, is_calibrated) = CalibrationService::read_calibration(&robot_type, &nickname)?;
    Ok((calibration, is_calibrated))
}

#[tauri::command]
pub fn write_calibration(robot_type: String, nickname: String, calibration: Calibration) -> Result<(), String> {
    CalibrationService::write_calibration(&robot_type, &nickname, calibration)
}

#[tauri::command]
pub fn get_calibration_modified_at(robot_type: String, nickname: String) -> Result<Option<u64>, String> {
    CalibrationService::get_calibration_modified_at(&robot_type, &nickname)
}

#[tauri::command]
pub async fn auto_calibrate(
    app_handle: AppHandle,
    config: CalibrationConfig,
) -> Result<(), String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    CalibrationService::auto_calibrate(app_handle, db_connection, config).await
}

#[tauri::command]
pub async fn remote_auto_calibrate(
    app_handle: AppHandle,
    config: RemoteCalibrationConfig,
) -> Result<(), String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    CalibrationService::remote_auto_calibrate(
        app_handle,
        db_connection,
        &config.nickname,
        &config.robot_type,
        config.full_reset,
    )
    .await
}

#[tauri::command]
pub fn desktop_get_teleop_calibration_status(
    config: DesktopTeleopCalibrationStatusConfig,
) -> Result<DesktopTeleopCalibrationStatus, String> {
    CalibrationService::desktop_get_teleop_calibration_status(&config.teleop_type, &config.nickname)
}

#[tauri::command]
pub async fn desktop_auto_calibrate_teleoperator(
    app_handle: AppHandle,
    config: DesktopTeleopCalibrationConfig,
) -> Result<(), String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    CalibrationService::desktop_auto_calibrate_teleoperator(app_handle, db_connection, config).await
}
