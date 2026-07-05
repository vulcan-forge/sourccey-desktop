use crate::modules::control::services::kiosk_control::kiosk_host_service::KioskHostProcess;
use crate::modules::control::services::kiosk_control::manual_drive_service::KioskManualDriveProcess;
use crate::modules::control::services::kiosk_control::torque_service::KioskTorqueService;
use tauri::{command, AppHandle, Manager, State};

#[command]
pub async fn untorque_kiosk_robot_arms(
    app_handle: AppHandle,
    host_state: State<'_, KioskHostProcess>,
    manual_drive_state: State<'_, KioskManualDriveProcess>,
    nickname: String,
) -> Result<String, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let db_connection = db_manager.get_connection().clone();
    KioskTorqueService::untorque_kiosk_robot_arms(
        app_handle,
        db_connection,
        &host_state,
        &manual_drive_state,
        nickname,
    )
    .await
}
