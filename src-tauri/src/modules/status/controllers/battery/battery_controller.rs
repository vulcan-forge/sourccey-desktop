use crate::modules::status::services::battery::battery_service::{BatteryData, BatteryService};
use tauri::command;

#[command]
pub fn get_battery_data() -> Result<BatteryData, String> {
    BatteryService::get_battery_data()
}
