use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MotorCalibration {
    pub id: u32,
    pub drive_mode: u32,
    pub homing_offset: i32,
    pub range_min: u32,
    pub range_max: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Calibration {
    #[serde(flatten)]
    pub motors: HashMap<String, MotorCalibration>,
}
