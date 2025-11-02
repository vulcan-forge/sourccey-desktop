use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    pub username: String,
    pub password: String,
    pub left_arm_port: String,
    pub right_arm_port: String,
    pub keyboard: String,
    pub fps: u32,
}
