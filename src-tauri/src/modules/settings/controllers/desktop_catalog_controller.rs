use crate::modules::settings::services::desktop_catalog_service::{
    DesktopCatalogResponse, DesktopCatalogService,
};
use std::collections::BTreeMap;

#[tauri::command]
pub async fn desktop_get_robot_catalog(
    path: String,
    query: BTreeMap<String, String>,
) -> Result<DesktopCatalogResponse, String> {
    DesktopCatalogService::get(&path, &query).await
}
