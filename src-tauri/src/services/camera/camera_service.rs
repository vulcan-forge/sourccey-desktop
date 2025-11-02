use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CameraConfig {
    pub camera_name: String,
    pub camera_type: String,
    pub camera_index: i32,
    pub width: i32,
    pub height: i32,
    pub fps: i32,
}
