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
    const LAST_RELIABLE_SAMPLE_TTL: Duration = Duration::from_secs(120);
    const EMPTY_PACK_VOLTAGE: f64 = 11.5;
    // Python startup and the I2C transaction can exceed three seconds on a
    // Raspberry Pi during cold starts or while the system is under load.
    const BATTERY_SCRIPT_TIMEOUT: Duration = Duration::from_secs(10);

    pub fn get_battery_data() -> Result<BatteryData, String> {
        if let Some(cached) = Self::get_recent_cached_battery_data() {
            return Ok(cached);
        }

        let lerobot_dir = DirectoryService::get_lerobot_vulcan_dir()?;
        let python_path = DirectoryService::get_python_path()?;
        let mut cmd = Command::new(python_path);
        cmd.arg("-m").arg("lerobot_robot_sourccey.battery.battery");
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

        // A cold or interrupted BQ34Z100 initialization can produce a valid
        // I2C response whose SOC and remaining capacity are temporarily zero.
        // Keep the last trustworthy capacity fields briefly, but continue to
        // expose the fresh voltage/current readings. Do not cache the merged
        // sample, so a bad zero cannot extend its own grace period forever.
        if Self::is_suspicious_zero_sample(&battery_data) {
            if let Some(previous) = Self::get_last_reliable_battery_data() {
                return Ok(Self::merge_with_previous_capacity(battery_data, &previous));
            }
            return Ok(battery_data);
        }

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

    fn get_last_reliable_battery_data() -> Option<BatteryData> {
        let guard = Self::cache().lock().ok()?;
        let cached = guard.as_ref()?;
        if cached.captured_at.elapsed() > Self::LAST_RELIABLE_SAMPLE_TTL
            || cached.data.state_of_charge <= 0
        {
            return None;
        }
        Some(cached.data.clone())
    }

    fn is_suspicious_zero_sample(data: &BatteryData) -> bool {
        data.state_of_charge == 0
            && data.voltage.is_finite()
            && data.voltage > Self::EMPTY_PACK_VOLTAGE
    }

    fn merge_with_previous_capacity(
        mut current: BatteryData,
        previous: &BatteryData,
    ) -> BatteryData {
        current.state_of_charge = previous.state_of_charge;
        if current.remaining_capacity_ah <= 0.0 && previous.remaining_capacity_ah > 0.0 {
            current.remaining_capacity_ah = previous.remaining_capacity_ah;
        }
        if current.max_capacity_ah <= 0.0 && previous.max_capacity_ah > 0.0 {
            current.max_capacity_ah = previous.max_capacity_ah;
        }
        current
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

#[cfg(test)]
mod tests {
    use super::{BatteryData, BatteryService};

    fn battery(voltage: f64, state_of_charge: i32, remaining_capacity_ah: f64) -> BatteryData {
        BatteryData {
            voltage,
            current_a: -1.0,
            remaining_capacity_ah,
            max_capacity_ah: 8.0,
            state_of_charge,
            max_error: 2,
            error: None,
        }
    }

    #[test]
    fn identifies_zero_soc_that_conflicts_with_pack_voltage() {
        assert!(BatteryService::is_suspicious_zero_sample(&battery(
            12.6, 0, 0.0
        )));
        assert!(!BatteryService::is_suspicious_zero_sample(&battery(
            11.5, 0, 0.0
        )));
        assert!(!BatteryService::is_suspicious_zero_sample(&battery(
            12.6, 42, 3.0
        )));
    }

    #[test]
    fn preserves_capacity_but_keeps_fresh_electrical_measurements() {
        let previous = battery(12.7, 62, 4.8);
        let mut current = battery(12.4, 0, 0.0);
        current.current_a = -2.25;

        let merged = BatteryService::merge_with_previous_capacity(current, &previous);

        assert_eq!(merged.state_of_charge, 62);
        assert_eq!(merged.remaining_capacity_ah, 4.8);
        assert_eq!(merged.voltage, 12.4);
        assert_eq!(merged.current_a, -2.25);
    }
}
