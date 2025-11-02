use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use serde::{Deserialize, Serialize};
use serde_json;

use crate::services::directory::directory_service::DirectoryService;
use crate::services::environment::env_service::EnvService;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct BatteryData {
    pub voltage: f64,
    pub percent: i32,
}

pub struct BatteryService;

impl BatteryService {
    pub fn get_battery_data() -> Result<BatteryData, String> {
        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;
        let script_path = lerobot_dir.join("src/lerobot/scripts/sourccey/battery.py");

        let mut cmd = Command::new(python_path);
        cmd.arg(&script_path);

        // Execute the command and capture output
        let output = cmd
            .current_dir(&lerobot_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to execute battery script: {}", e))?;

        // Check if command succeeded
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Battery script failed: {}", stderr));
        }

        // Parse the JSON output
        let stdout = String::from_utf8(output.stdout)
            .map_err(|e| format!("Failed to read script output: {}", e))?;

        let battery_data = serde_json::from_str::<BatteryData>(&stdout)
            .map_err(|e| format!("Failed to parse battery data: {}", e))?;

        Ok(battery_data)
    }
}

