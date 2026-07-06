use serde::{Deserialize, Serialize};
use serde_json;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use std::time::Instant;

use crate::services::directory::directory_service::DirectoryService;
use crate::utils::windows_process::configure_std_command;

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct BatteryData {
    pub voltage: f64,
    #[serde(default)]
    pub current_a: f64,
    #[serde(default)]
    pub remaining_capacity_ah: f64,
    #[serde(default)]
    pub max_capacity_ah: f64,
    pub state_of_charge: i32,
    #[serde(default)]
    pub max_error: i32,
    #[serde(default)]
    pub error: Option<String>,
}

pub struct BatteryService;

#[derive(Clone)]
struct CachedBatteryData {
    captured_at: Instant,
    data: BatteryData,
}

static BATTERY_CACHE: OnceLock<Mutex<Option<CachedBatteryData>>> = OnceLock::new();

impl BatteryService {
    const BATTERY_CACHE_TTL: Duration = Duration::from_secs(5);
    const BATTERY_SCRIPT_TIMEOUT: Duration = Duration::from_secs(3);

    pub fn get_battery_data() -> Result<BatteryData, String> {
        if let Some(cached) = Self::get_recent_cached_battery_data() {
            return Ok(cached);
        }

        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;
        let script_path = lerobot_dir.join("src/lerobot/scripts/sourccey/battery/battery.py");

        let mut cmd = Command::new(python_path);
        cmd.arg(&script_path);
        configure_std_command(&mut cmd);

        let mut child = cmd
            .current_dir(&lerobot_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to execute battery script: {}", e))?;

        let start = Instant::now();
        let output = loop {
            if let Some(status) = child
                .try_wait()
                .map_err(|e| format!("Failed while waiting for battery script: {}", e))?
            {
                let output = child
                    .wait_with_output()
                    .map_err(|e| format!("Failed to collect battery script output: {}", e))?;
                break (status.success(), output);
            }

            if start.elapsed() >= Self::BATTERY_SCRIPT_TIMEOUT {
                let _ = child.kill();
                let _ = child.wait();
                if let Some(cached) = Self::get_any_cached_battery_data() {
                    return Ok(cached);
                }
                return Err(format!(
                    "Battery script timed out after {:?}",
                    Self::BATTERY_SCRIPT_TIMEOUT
                ));
            }

            thread::sleep(Duration::from_millis(50));
        };

        // Check if command succeeded
        if !output.0 {
            let stderr = String::from_utf8_lossy(&output.1.stderr);
            return Err(format!("Battery script failed: {}", stderr));
        }

        // Parse the JSON output
        let stdout = String::from_utf8(output.1.stdout)
            .map_err(|e| format!("Failed to read script output: {}", e))?;

        let battery_data = serde_json::from_str::<BatteryData>(&stdout)
            .map_err(|e| format!("Failed to parse battery data: {}", e))?;

        Self::set_cached_battery_data(&battery_data);
        Ok(battery_data)
    }

    fn cache() -> &'static Mutex<Option<CachedBatteryData>> {
        BATTERY_CACHE.get_or_init(|| Mutex::new(None))
    }

    fn get_recent_cached_battery_data() -> Option<BatteryData> {
        let guard = Self::cache().lock().ok()?;
        let cached = guard.as_ref()?;
        if cached.captured_at.elapsed() <= Self::BATTERY_CACHE_TTL {
            return Some(cached.data.clone());
        }
        None
    }

    fn get_any_cached_battery_data() -> Option<BatteryData> {
        let guard = Self::cache().lock().ok()?;
        guard.as_ref().map(|cached| cached.data.clone())
    }

    fn set_cached_battery_data(data: &BatteryData) {
        if let Ok(mut guard) = Self::cache().lock() {
            *guard = Some(CachedBatteryData {
                captured_at: Instant::now(),
                data: data.clone(),
            });
        }
    }
}
