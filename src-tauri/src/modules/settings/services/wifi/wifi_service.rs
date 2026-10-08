use crate::modules::settings::services::access_point::access_point_service::{
    AccessPointService, WiFiModeResult,
};

pub struct WiFiService;

impl WiFiService {
    pub async fn set_wifi(ssid: String) -> Result<WiFiModeResult, String> {
        AccessPointService::set_wifi_mode(ssid).await
    }
}
