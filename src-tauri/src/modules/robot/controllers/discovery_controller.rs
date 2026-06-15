use crate::modules::robot::services::discovery_service::{
    LanRobotDiscoveryResult, LanRobotDiscoveryService,
};

#[tauri::command]
pub async fn discover_lan_robots() -> Result<LanRobotDiscoveryResult, String> {
    LanRobotDiscoveryService::discover_lan_robots().await
}
