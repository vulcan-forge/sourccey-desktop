use super::desktop_environment::desktop_environment_service::DesktopEnvironmentService;
use reqwest::Url;
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::time::Duration;

pub struct DesktopCatalogService;

#[derive(Debug, Serialize)]
pub struct DesktopCatalogResponse {
    pub status: u16,
    pub body: Value,
}

impl DesktopCatalogService {
    fn url(base: &str, path: &str, query: &BTreeMap<String, String>) -> Result<Url, String> {
        let allowed: &[&str] = match path {
            "robots" => &["limit", "cursor", "sort", "search"],
            "robots/lookup" => &["id", "name"],
            _ => return Err("Unsupported robot catalog route".to_string()),
        };
        let mut url = Url::parse(&format!("{}/{}", base.trim_end_matches('/'), path))
            .map_err(|e| format!("Invalid catalog API URL: {}", e))?;
        for (key, value) in query {
            if !allowed.contains(&key.as_str()) {
                return Err(format!("Unsupported catalog parameter: {}", key));
            }
            url.query_pairs_mut().append_pair(key, value);
        }
        Ok(url)
    }

    pub async fn get(
        path: &str,
        query: &BTreeMap<String, String>,
    ) -> Result<DesktopCatalogResponse, String> {
        let settings = DesktopEnvironmentService::get_settings()?;
        let url = Self::url(&settings.website_api_url, path, query)?;
        let response = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| format!("Failed to initialize catalog client: {}", e))?
            .get(url)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("Unable to reach the robot catalog: {}", e))?;
        let status = response.status().as_u16();
        let body = response.json::<Value>().await.unwrap_or(Value::Null);
        if (200..300).contains(&status) && body.is_null() {
            return Err("Robot catalog returned an invalid response".to_string());
        }
        Ok(DesktopCatalogResponse { status, body })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_urls_preserve_the_api_prefix_and_opaque_parameters() {
        let query = BTreeMap::from([
            ("cursor".into(), "opaque+/=".into()),
            ("search".into(), "robot \"one\" & two".into()),
        ]);
        let url = DesktopCatalogService::url("http://host/proxy/v1/", "robots", &query).unwrap();
        assert_eq!(url.path(), "/proxy/v1/robots");
        assert_eq!(
            url.query_pairs()
                .collect::<BTreeMap<_, _>>()
                .get("cursor")
                .unwrap(),
            "opaque+/="
        );
    }

    #[test]
    fn catalog_proxy_only_accepts_documented_public_get_routes() {
        for path in [
            "../auth/login",
            "https://other.example/robots",
            "admin/accounts",
            "/robots",
        ] {
            assert!(
                DesktopCatalogService::url("https://api.example/v1", path, &BTreeMap::new())
                    .is_err()
            );
        }
        assert!(DesktopCatalogService::url(
            "https://api.example/v1",
            "robots/lookup",
            &BTreeMap::from([("name".into(), "robot".into())])
        )
        .is_ok());
        assert!(DesktopCatalogService::url(
            "https://api.example/v1",
            "robots",
            &BTreeMap::from([("where".into(), "legacy filter".into())])
        )
        .is_err());
    }
}
