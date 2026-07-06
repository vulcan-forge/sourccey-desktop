use crate::modules::settings::services::desktop_auth_service::{
    DesktopStudioAuthService, DesktopStudioLoginRequest, DesktopStudioProxyResponse,
};

#[tauri::command]
pub async fn desktop_login_via_studio(
    request: DesktopStudioLoginRequest,
) -> Result<DesktopStudioProxyResponse, String> {
    DesktopStudioAuthService::login_via_studio(request).await
}
