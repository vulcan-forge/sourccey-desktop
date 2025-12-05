use crate::modules::control::services::configuration::calibration_service::CalibrationService;
use crate::modules::control::types::configuration::calibration_types::{
    Calibration,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

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

#[tauri::command]
pub fn read_calibration(robot_type: String, nickname: String) -> Result<(Calibration, bool), String> {
    println!("--------------------------------");
    println!("robot_type: {:?}", robot_type);
    println!("nickname: {:?}", nickname);
    println!("--------------------------------");
    let (calibration, is_calibrated) = CalibrationService::read_calibration(&robot_type, &nickname)?;
    Ok((calibration, is_calibrated))
}

#[tauri::command]
pub fn write_calibration(robot_type: String, nickname: String, calibration: Calibration) -> Result<(), String> {
    CalibrationService::write_calibration(&robot_type, &nickname, calibration)
}

#[tauri::command]
pub async fn auto_calibrate(
    app_handle: AppHandle,
    config: CalibrationConfig,
) -> Result<(), String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    CalibrationService::auto_calibrate(db_connection, config).await
}

#[tauri::command]
pub async fn remote_auto_calibrate(
    app_handle: AppHandle,
    config: RemoteCalibrationConfig,
) -> Result<(), String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    CalibrationService::remote_auto_calibrate(db_connection, &config.nickname, &config.robot_type, config.full_reset).await
}
