use crate::modules::settings::services::desktop_environment::desktop_environment_service::DesktopEnvironmentService;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

pub struct DesktopStudioAuthService;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopStudioLoginRequest {
    pub email: String,
    pub password: String,
    pub provider: i32,
    pub intent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopStudioProxyResponse {
    pub status: u16,
    pub body: Value,
}

impl DesktopStudioAuthService {
    pub async fn login_via_studio(
        request: DesktopStudioLoginRequest,
    ) -> Result<DesktopStudioProxyResponse, String> {
        let settings = DesktopEnvironmentService::get_settings()?;
        let url = format!("{}/api/relay-auth/login", settings.studio_web_url);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|e| format!("Failed to initialize Studio login client: {}", e))?;

        let response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Failed to reach Studio login at {}: {}", url, e))?;

        let status = response.status().as_u16();
        let raw_body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read Studio login response from {}: {}", url, e))?;

        let body = if raw_body.trim().is_empty() {
            json!({})
        } else {
            serde_json::from_str::<Value>(&raw_body).map_err(|e| {
                format!(
                    "Studio login returned invalid JSON from {} (HTTP {}): {}",
                    url, status, e
                )
            })?
        };

        Ok(DesktopStudioProxyResponse { status, body })
    }
}
