use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use lazy_static::lazy_static;
use tauri::{AppHandle, Emitter};

use crate::services::directory::directory_service::DirectoryService;
use crate::services::setup::local_setup_service::SetupProgress;

pub struct KioskUpdateService;

#[derive(Clone)]
struct KioskTagCacheEntry {
    fetched_at: Instant,
    latest_tag: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct SimpleSemver {
    major: u64,
    minor: u64,
    patch: u64,
}

lazy_static! {
    static ref KIOSK_APP_TAG_CACHE: Mutex<Option<KioskTagCacheEntry>> = Mutex::new(None);
    static ref KIOSK_LEROBOT_TAG_CACHE: Mutex<Option<KioskTagCacheEntry>> = Mutex::new(None);
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KioskUpdateStatus {
    pub update_available: bool,
    pub app_update_available: bool,
    pub lerobot_update_available: bool,
    pub app_current: Option<String>,
    pub app_remote: Option<String>,
    pub lerobot_current: Option<String>,
    pub lerobot_remote: Option<String>,
    pub error: Option<String>,
}

impl KioskUpdateService {
    const DEFAULT_KIOSK_APP_TAGS_URL: &str = "https://api.github.com/repos/vulcan-forge/sourccey-desktop/tags?per_page=100";
    const DEFAULT_KIOSK_LEROBOT_TAGS_URL: &str = "https://api.github.com/repos/vulcan-forge/lerobot-vulcan/tags?per_page=100";
    const DEFAULT_KIOSK_APP_TAG_PREFIX: &str = "kiosk/";
    const DEFAULT_KIOSK_LEROBOT_TAG_PREFIX: &str = "vulcan/";
    const TAG_CACHE_TTL: Duration = Duration::from_secs(300);

    pub fn check_updates(_app_handle: &AppHandle) -> Result<KioskUpdateStatus, String> {
        let repo_root = DirectoryService::get_current_dir()?;
        let app_tag_prefix = Self::resolve_prefix_env(
            "SOURCCEY_KIOSK_APP_TAG_PREFIX",
            Self::DEFAULT_KIOSK_APP_TAG_PREFIX,
        );
        let lerobot_tag_prefix = Self::resolve_prefix_env(
            "SOURCCEY_KIOSK_LEROBOT_TAG_PREFIX",
            Self::DEFAULT_KIOSK_LEROBOT_TAG_PREFIX,
        );

        let mut error: Option<String> = None;
        let app_current = Self::resolve_current_repo_tag(&repo_root, &app_tag_prefix);
        let app_remote = match Self::resolve_latest_tag_cached(
            &KIOSK_APP_TAG_CACHE,
            "SOURCCEY_KIOSK_APP_TAGS_URL",
            Self::DEFAULT_KIOSK_APP_TAGS_URL,
            &app_tag_prefix,
        ) {
            Ok(tag) => tag,
            Err(err) => {
                Self::append_error(&mut error, err);
                None
            }
        };
        let app_update_available = !Self::is_current_tag_up_to_date(
            app_current.as_deref(),
            app_remote.as_deref(),
            &app_tag_prefix,
        );

        let lerobot_dir = repo_root.join("modules").join("lerobot-vulcan");
        let lerobot_current = Self::resolve_current_repo_tag(&lerobot_dir, &lerobot_tag_prefix);
        let lerobot_remote = match Self::resolve_latest_tag_cached(
            &KIOSK_LEROBOT_TAG_CACHE,
            "SOURCCEY_KIOSK_LEROBOT_TAGS_URL",
            Self::DEFAULT_KIOSK_LEROBOT_TAGS_URL,
            &lerobot_tag_prefix,
        ) {
            Ok(tag) => tag,
            Err(err) => {
                Self::append_error(&mut error, err);
                None
            }
        };
        let lerobot_update_available = !Self::is_current_tag_up_to_date(
            lerobot_current.as_deref(),
            lerobot_remote.as_deref(),
            &lerobot_tag_prefix,
        );

        let update_available = app_update_available || lerobot_update_available;

        Ok(KioskUpdateStatus {
            update_available,
            app_update_available,
            lerobot_update_available,
            app_current,
            app_remote,
            lerobot_current,
            lerobot_remote,
            error,
        })
    }

    pub fn repair_lerobot(app_handle: &AppHandle) -> Result<(), String> {
        let emit = |progress: SetupProgress| {
            let _ = app_handle.emit("kiosk:setup-progress", progress);
        };

        let repo_root = DirectoryService::get_current_dir()?;

        Self::emit_step(
            Some(&emit),
            "submodules",
            "started",
            Some("Updating lerobot-vulcan submodule".to_string()),
        );
        Self::run_command(
            "git",
            &["submodule", "sync", "--recursive"],
            &repo_root,
            "git submodule sync",
        )?;
        Self::run_command(
            "git",
            &[
                "submodule",
                "update",
                "--init",
                "--recursive",
                "--checkout",
                "modules/lerobot-vulcan",
            ],
            &repo_root,
            "git submodule update",
        )?;
        Self::emit_step(
            Some(&emit),
            "submodules",
            "success",
            Some("lerobot-vulcan updated".to_string()),
        );

        Self::emit_step(
            Some(&emit),
            "complete",
            "success",
            Some("Repair complete".to_string()),
        );
        Ok(())
    }

    pub fn update_kiosk(app_handle: &AppHandle) -> Result<(), String> {
        let emit = |progress: SetupProgress| {
            let _ = app_handle.emit("kiosk:setup-progress", progress);
        };

        let repo_root = DirectoryService::get_current_dir()?;
        let update_ref = std::env::var("SOURCCEY_KIOSK_UPDATE_REF")
            .unwrap_or_else(|_| "origin/main".to_string())
            .trim()
            .to_string();
        let update_ref = if update_ref.is_empty() {
            "origin/main".to_string()
        } else {
            update_ref
        };

        Self::emit_step(
            Some(&emit),
            "fetch",
            "started",
            Some("Fetching latest kiosk code".to_string()),
        );
        Self::run_command("git", &["fetch", "--prune"], &repo_root, "git fetch")?;
        Self::emit_step(Some(&emit), "fetch", "success", None);

        Self::emit_step(
            Some(&emit),
            "reset",
            "started",
            Some(format!("Resetting to {}", update_ref)),
        );
        Self::run_command(
            "git",
            &["reset", "--hard", update_ref.as_str()],
            &repo_root,
            "git reset",
        )?;
        Self::emit_step(Some(&emit), "reset", "success", None);

        Self::emit_step(
            Some(&emit),
            "submodules",
            "started",
            Some("Updating submodules".to_string()),
        );
        Self::run_command(
            "git",
            &["submodule", "sync", "--recursive"],
            &repo_root,
            "git submodule sync",
        )?;
        Self::run_command(
            "git",
            &["submodule", "update", "--init", "--recursive"],
            &repo_root,
            "git submodule update",
        )?;
        Self::emit_step(Some(&emit), "submodules", "success", None);

        Self::emit_step(
            Some(&emit),
            "setup",
            "started",
            Some("Running kiosk setup (this can take 30-40 minutes)".to_string()),
        );
        Self::run_kiosk_setup(&repo_root)?;
        Self::emit_step(Some(&emit), "setup", "success", None);

        Self::emit_step(
            Some(&emit),
            "complete",
            "success",
            Some("Kiosk update complete".to_string()),
        );
        Ok(())
    }

    fn run_kiosk_setup(repo_root: &Path) -> Result<(), String> {
        let mut command = Command::new("sudo");
        command.args([
            "-n",
            "python3",
            "setup/kiosk/setup.py",
            "--skip-system",
            "--no-clean",
            "--use-https",
        ]);
        let status = command
            .current_dir(repo_root)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()
            .map_err(|e| format!("Failed to start kiosk setup: {}", e))?;

        if !status.success() {
            return Err(format!("Kiosk setup failed with status: {}", status));
        }

        Ok(())
    }

    fn run_command(cmd: &str, args: &[&str], cwd: &Path, label: &str) -> Result<(), String> {
        let output = Command::new(cmd)
            .args(args)
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("Failed to run {}: {}", label, e))?;

        if !output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let details = if !stderr.trim().is_empty() {
                stderr.trim().to_string()
            } else {
                stdout.trim().to_string()
            };
            return Err(format!("{} failed: {}", label, details));
        }

        Ok(())
    }

    fn resolve_prefix_env(name: &str, fallback: &str) -> String {
        let value = std::env::var(name).unwrap_or_else(|_| fallback.to_string());
        let trimmed = value.trim();
        if trimmed.is_empty() {
            fallback.to_string()
        } else {
            trimmed.to_string()
        }
    }

    fn append_error(error: &mut Option<String>, next: String) {
        match error {
            Some(existing) => {
                if !existing.is_empty() {
                    existing.push_str(" | ");
                }
                existing.push_str(&next);
            }
            None => {
                *error = Some(next);
            }
        }
    }

    fn resolve_current_repo_tag(repo_dir: &Path, prefix: &str) -> Option<String> {
        if !repo_dir.exists() {
            return None;
        }

        let output = Command::new("git")
            .args(["tag", "--points-at", "HEAD"])
            .current_dir(repo_dir)
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }

        let tags = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|line| line.trim().to_string())
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>();
        Self::select_latest_prefixed_tag(tags, prefix)
    }

    fn resolve_latest_tag_cached(
        cache: &Mutex<Option<KioskTagCacheEntry>>,
        url_env_key: &str,
        default_url: &str,
        prefix: &str,
    ) -> Result<Option<String>, String> {
        let now = Instant::now();
        let mut cache_guard = cache
            .lock()
            .map_err(|_| "Failed to lock kiosk tag cache".to_string())?;

        Self::resolve_latest_tag_with_cache_entry(
            &mut cache_guard,
            now,
            || Self::fetch_latest_tag_from_api(url_env_key, default_url, prefix),
        )
    }

    fn resolve_latest_tag_with_cache_entry<F>(
        cache: &mut Option<KioskTagCacheEntry>,
        now: Instant,
        fetch_latest_tag: F,
    ) -> Result<Option<String>, String>
    where
        F: FnOnce() -> Result<Option<String>, String>,
    {
        if let Some(entry) = cache.as_ref() {
            if now.duration_since(entry.fetched_at) <= Self::TAG_CACHE_TTL {
                return Ok(entry.latest_tag.clone());
            }
        }

        let latest_tag = fetch_latest_tag()?;
        *cache = Some(KioskTagCacheEntry {
            fetched_at: now,
            latest_tag: latest_tag.clone(),
        });
        Ok(latest_tag)
    }

    fn fetch_latest_tag_from_api(
        url_env_key: &str,
        default_url: &str,
        prefix: &str,
    ) -> Result<Option<String>, String> {
        let url = std::env::var(url_env_key).unwrap_or_else(|_| default_url.to_string());
        let client = reqwest::blocking::Client::builder()
            .build()
            .map_err(|e| format!("Failed to create HTTP client for {}: {}", url_env_key, e))?;
        let response = client
            .get(&url)
            .header(reqwest::header::USER_AGENT, "VulcanStudio/kiosk-tag-check")
            .send()
            .map_err(|e| format!("Failed to download tags from {}: {}", url_env_key, e))?;
        if !response.status().is_success() {
            return Err(format!(
                "Tag request failed for {} ({}): {}",
                url_env_key,
                response.status(),
                url
            ));
        }

        let payload: serde_json::Value = response
            .json()
            .map_err(|e| format!("Invalid tag payload for {}: {}", url_env_key, e))?;
        let tags = Self::extract_tag_names_from_value(&payload);
        Ok(Self::select_latest_prefixed_tag(tags, prefix))
    }

    fn extract_tag_names_from_value(value: &serde_json::Value) -> Vec<String> {
        match value {
            serde_json::Value::Array(items) => items
                .iter()
                .filter_map(|item| {
                    if let Some(name) = item.as_str() {
                        return Some(name.trim().to_string());
                    }
                    if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                        return Some(name.trim().to_string());
                    }
                    item.get("tag")
                        .and_then(|v| v.as_str())
                        .map(|tag| tag.trim().to_string())
                })
                .filter(|name| !name.is_empty())
                .collect(),
            serde_json::Value::Object(_) => value
                .get("tags")
                .map(Self::extract_tag_names_from_value)
                .unwrap_or_default(),
            _ => Vec::new(),
        }
    }

    fn select_latest_prefixed_tag(tags: Vec<String>, prefix: &str) -> Option<String> {
        let mut fallback: Option<String> = None;
        let mut best_semver: Option<(SimpleSemver, String)> = None;

        for tag in tags {
            let normalized = match Self::normalize_prefixed_tag(&tag, prefix) {
                Some(value) => value,
                None => continue,
            };
            if fallback.is_none() {
                fallback = Some(normalized.clone());
            }
            if let Some(version) = Self::parse_prefixed_semver(&normalized, prefix) {
                match best_semver.as_ref() {
                    Some((best_version, _)) if &version <= best_version => {}
                    _ => best_semver = Some((version, normalized.clone())),
                }
            }
        }

        best_semver.map(|(_, tag)| tag).or(fallback)
    }

    fn normalize_prefixed_tag(tag: &str, prefix: &str) -> Option<String> {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            return None;
        }
        if trimmed.starts_with(prefix) {
            return Some(trimmed.to_string());
        }
        let maybe_version = trimmed.strip_prefix('v').unwrap_or(trimmed);
        if Self::parse_semver_core(maybe_version).is_some() {
            return Some(format!("{}{}", prefix, maybe_version));
        }
        None
    }

    fn parse_prefixed_semver(tag: &str, prefix: &str) -> Option<SimpleSemver> {
        let normalized = Self::normalize_prefixed_tag(tag, prefix)?;
        let raw_version = normalized.strip_prefix(prefix)?;
        let version = raw_version.strip_prefix('v').unwrap_or(raw_version);
        Self::parse_semver_core(version)
    }

    fn parse_semver_core(value: &str) -> Option<SimpleSemver> {
        let mut parts = value.split('.');
        let major = parts.next()?.parse::<u64>().ok()?;
        let minor = parts.next()?.parse::<u64>().ok()?;
        let patch = parts.next()?.parse::<u64>().ok()?;
        if parts.next().is_some() {
            return None;
        }
        Some(SimpleSemver { major, minor, patch })
    }

    fn is_current_tag_up_to_date(current: Option<&str>, latest: Option<&str>, prefix: &str) -> bool {
        match (current, latest) {
            (Some(current_tag), Some(latest_tag)) => {
                match (
                    Self::parse_prefixed_semver(current_tag, prefix),
                    Self::parse_prefixed_semver(latest_tag, prefix),
                ) {
                    (Some(current_version), Some(latest_version)) => current_version >= latest_version,
                    _ => current_tag == latest_tag,
                }
            }
            (None, Some(_)) => false,
            _ => true,
        }
    }

    fn emit_step(emit: Option<&dyn Fn(SetupProgress)>, step: &str, status: &str, message: Option<String>) {
        if let Some(emit) = emit {
            emit(SetupProgress {
                step: step.to_string(),
                status: status.to_string(),
                message,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_prefixed_semver_tags() {
        assert_eq!(
            KioskUpdateService::parse_prefixed_semver("kiosk/1.2.3", "kiosk/"),
            Some(SimpleSemver {
                major: 1,
                minor: 2,
                patch: 3
            })
        );
        assert_eq!(
            KioskUpdateService::parse_prefixed_semver("kiosk/v0.5.0", "kiosk/"),
            Some(SimpleSemver {
                major: 0,
                minor: 5,
                patch: 0
            })
        );
        assert_eq!(KioskUpdateService::parse_prefixed_semver("kiosk/latest", "kiosk/"), None);
    }

    #[test]
    fn selects_latest_tag_for_prefix() {
        let selected = KioskUpdateService::select_latest_prefixed_tag(
            vec![
                "vulcan/0.1.0".to_string(),
                "vulcan/0.3.0".to_string(),
                "other/9.9.9".to_string(),
                "vulcan/0.2.5".to_string(),
            ],
            "vulcan/",
        );
        assert_eq!(selected, Some("vulcan/0.3.0".to_string()));
    }

    #[test]
    fn compares_current_and_latest_tags() {
        assert!(KioskUpdateService::is_current_tag_up_to_date(
            Some("kiosk/1.0.0"),
            Some("kiosk/1.0.0"),
            "kiosk/"
        ));
        assert!(KioskUpdateService::is_current_tag_up_to_date(
            Some("kiosk/1.1.0"),
            Some("kiosk/1.0.0"),
            "kiosk/"
        ));
        assert!(!KioskUpdateService::is_current_tag_up_to_date(
            Some("kiosk/1.0.0"),
            Some("kiosk/1.1.0"),
            "kiosk/"
        ));
        assert!(!KioskUpdateService::is_current_tag_up_to_date(
            None,
            Some("kiosk/1.1.0"),
            "kiosk/"
        ));
        assert!(KioskUpdateService::is_current_tag_up_to_date(
            Some("kiosk/non-semver"),
            Some("kiosk/non-semver"),
            "kiosk/"
        ));
    }

    #[test]
    fn reuses_cached_tag_inside_ttl() {
        let mut cache: Option<KioskTagCacheEntry> = None;
        let start = Instant::now();
        let mut calls = 0;

        let first = KioskUpdateService::resolve_latest_tag_with_cache_entry(&mut cache, start, || {
            calls += 1;
            Ok(Some("kiosk/1.0.0".to_string()))
        })
        .expect("first call should succeed");
        assert_eq!(first, Some("kiosk/1.0.0".to_string()));
        assert_eq!(calls, 1);

        let second = KioskUpdateService::resolve_latest_tag_with_cache_entry(
            &mut cache,
            start + Duration::from_secs(120),
            || {
                calls += 1;
                Ok(Some("kiosk/2.0.0".to_string()))
            },
        )
        .expect("second call should reuse cache");
        assert_eq!(second, Some("kiosk/1.0.0".to_string()));
        assert_eq!(calls, 1);

        let third = KioskUpdateService::resolve_latest_tag_with_cache_entry(
            &mut cache,
            start + KioskUpdateService::TAG_CACHE_TTL + Duration::from_secs(1),
            || {
                calls += 1;
                Ok(Some("kiosk/2.0.0".to_string()))
            },
        )
        .expect("third call should refresh after ttl");
        assert_eq!(third, Some("kiosk/2.0.0".to_string()));
        assert_eq!(calls, 2);
    }
}
