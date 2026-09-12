use serde::{Deserialize, Serialize};
use std::collections::HashMap;

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConfigConfig {
    pub nickname: String,
    pub robot_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Arm {
    pub port: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Camera {
    #[serde(rename = "type")]
    pub camera_type: String,
    pub camera_index: u32,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub color_mode: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    pub leader_arms: std::collections::HashMap<String, Arm>,
    pub follower_arms: std::collections::HashMap<String, Arm>,
    pub cameras: std::collections::HashMap<String, Camera>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteConfig {
    pub remote_ip: String,
    pub remote_port: String,
    pub left_arm_port: String,
    pub right_arm_port: String,
    pub keyboard: String,
    pub fps: u32,
    #[serde(default)]
    pub display_data: bool,
    #[serde(default = "default_true")]
    pub record_rollout_data: bool,
}

#[cfg(test)]
mod tests {
    use super::RemoteConfig;

    #[test]
    fn legacy_remote_config_defaults_to_recording_rollouts() {
        let config: RemoteConfig = serde_json::from_str(
            r#"{
                "remote_ip": "192.168.1.10",
                "remote_port": "22",
                "left_arm_port": "",
                "right_arm_port": "",
                "keyboard": "sourccey_keyboard",
                "fps": 30,
                "display_data": false
            }"#,
        )
        .expect("legacy remote config should deserialize");

        assert!(config.record_rollout_data);
    }
}
