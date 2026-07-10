use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use lazy_static::lazy_static;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::services::directory::directory_service::DirectoryService;
use crate::services::setup::local_setup_service::SetupProgress;

pub struct KioskUpdateService;

#[derive(Clone)]
struct KioskTagCacheEntry {
    fetched_at: Instant,
    latest_tag: Option<LatestTagInfo>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct LatestTagInfo {
    name: String,
    commit_sha: Option<String>,
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
    const DEFAULT_KIOSK_APP_TAGS_URL: &str =
        "https://api.github.com/repos/vulcan-forge/sourccey-desktop/tags?per_page=100";
    const DEFAULT_KIOSK_LEROBOT_TAGS_URL: &str =
        "https://api.github.com/repos/vulcan-forge/lerobot-vulcan/tags?per_page=100";
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
        let app_remote_info = match Self::resolve_latest_tag_cached(
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
        let app_remote = app_remote_info.as_ref().map(|tag| tag.name.clone());
        let app_update_available = !Self::is_repo_up_to_date(
            &repo_root,
            app_current.as_deref(),
            app_remote_info.as_ref(),
            &app_tag_prefix,
        );

        let lerobot_dir = repo_root.join("modules").join("lerobot-vulcan");
        let lerobot_current = Self::resolve_current_repo_tag(&lerobot_dir, &lerobot_tag_prefix);
        let lerobot_remote_info = match Self::resolve_latest_tag_cached(
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
        let lerobot_remote = lerobot_remote_info.as_ref().map(|tag| tag.name.clone());
        let lerobot_update_available = !Self::is_repo_up_to_date(
            &lerobot_dir,
            lerobot_current.as_deref(),
            lerobot_remote_info.as_ref(),
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
            app_handle,
            "git",
            &["submodule", "sync", "--recursive"],
            &repo_root,
            "git submodule sync",
        )?;
        Self::run_command(
            app_handle,
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
        Self::run_command(
            app_handle,
            "git",
            &["fetch", "--prune"],
            &repo_root,
            "git fetch",
        )?;
        Self::emit_step(Some(&emit), "fetch", "success", None);

        Self::emit_step(
            Some(&emit),
            "reset",
            "started",
            Some(format!("Resetting to {}", update_ref)),
        );
        Self::run_command(
            app_handle,
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
            app_handle,
            "git",
            &["submodule", "sync", "--recursive"],
            &repo_root,
            "git submodule sync",
        )?;
        Self::run_command(
            app_handle,
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
        Self::run_kiosk_setup(app_handle, &repo_root)?;
        Self::emit_step(Some(&emit), "setup", "success", None);

        Self::emit_step(
            Some(&emit),
            "complete",
            "success",
            Some("Kiosk update complete".to_string()),
        );
        Ok(())
    }

    fn run_kiosk_setup(app_handle: &AppHandle, repo_root: &Path) -> Result<(), String> {
        let mut command = Command::new("sudo");
        command.args([
            "-n",
            "python3",
            "setup/kiosk/setup.py",
            "--skip-system",
            "--no-clean",
            "--use-https",
        ]);
        Self::run_streaming_command(app_handle, &mut command, repo_root, "kiosk setup")
    }

    fn run_command(
        app_handle: &AppHandle,
        cmd: &str,
        args: &[&str],
        cwd: &Path,
        label: &str,
    ) -> Result<(), String> {
        let mut command = Command::new(cmd);
        command.args(args);
        Self::run_streaming_command(app_handle, &mut command, cwd, label)
    }

    fn run_streaming_command(
        app_handle: &AppHandle,
        command: &mut Command,
        cwd: &Path,
        label: &str,
    ) -> Result<(), String> {
        Self::emit_log(app_handle, format!("$ {}", label));
        let mut child = command
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start {}: {}", label, e))?;

        let recent_output = Arc::new(Mutex::new(Vec::<String>::new()));
        let mut readers = Vec::new();
        if let Some(stdout) = child.stdout.take() {
            readers.push(Self::stream_pipe(
                app_handle.clone(),
                stdout,
                Arc::clone(&recent_output),
            ));
        }
        if let Some(stderr) = child.stderr.take() {
            readers.push(Self::stream_pipe(
                app_handle.clone(),
                stderr,
                Arc::clone(&recent_output),
            ));
        }

        let status = child
            .wait()
            .map_err(|e| format!("Failed while waiting for {}: {}", label, e))?;
        for reader in readers {
            let _ = reader.join();
        }
        if !status.success() {
            let details = recent_output
                .lock()
                .ok()
                .map(|lines| lines.join("\n"))
                .unwrap_or_default();
            return Err(if details.is_empty() {
                format!("{} failed with status: {}", label, status)
            } else {
                format!("{} failed: {}", label, details)
            });
        }
        Self::emit_log(app_handle, format!("{} completed", label));
        Ok(())
    }

    fn stream_pipe<R>(
        app_handle: AppHandle,
        pipe: R,
        recent_output: Arc<Mutex<Vec<String>>>,
    ) -> std::thread::JoinHandle<()>
    where
        R: Read + Send + 'static,
    {
        std::thread::spawn(move || {
            for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                let trimmed = line.trim_end().to_string();
                if trimmed.is_empty() {
                    continue;
                }
                Self::emit_log(&app_handle, trimmed.clone());
                if let Ok(mut lines) = recent_output.lock() {
                    lines.push(trimmed);
                    if lines.len() > 20 {
                        lines.remove(0);
                    }
                }
            }
        })
    }

    fn emit_log(app_handle: &AppHandle, message: String) {
        let _ = app_handle.emit(
            "kiosk:setup-progress",
            SetupProgress {
                step: "log".to_string(),
                status: "log".to_string(),
                message: Some(message),
            },
        );
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
            .map(|name| LatestTagInfo {
                name,
                commit_sha: None,
            })
            .collect::<Vec<_>>();
        Self::select_latest_prefixed_tag(tags, prefix).map(|tag| tag.name)
    }

    fn resolve_latest_tag_cached(
        cache: &Mutex<Option<KioskTagCacheEntry>>,
        url_env_key: &str,
        default_url: &str,
        prefix: &str,
    ) -> Result<Option<LatestTagInfo>, String> {
        let now = Instant::now();
        let mut cache_guard = cache
            .lock()
            .map_err(|_| "Failed to lock kiosk tag cache".to_string())?;

        Self::resolve_latest_tag_with_cache_entry(&mut cache_guard, now, || {
            Self::fetch_latest_tag_from_api(url_env_key, default_url, prefix)
        })
    }

    fn resolve_latest_tag_with_cache_entry<F>(
        cache: &mut Option<KioskTagCacheEntry>,
        now: Instant,
        fetch_latest_tag: F,
    ) -> Result<Option<LatestTagInfo>, String>
    where
        F: FnOnce() -> Result<Option<LatestTagInfo>, String>,
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
    ) -> Result<Option<LatestTagInfo>, String> {
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
        let tags = Self::extract_tag_refs_from_value(&payload);
        Ok(Self::select_latest_prefixed_tag(tags, prefix))
    }

    fn extract_tag_refs_from_value(value: &serde_json::Value) -> Vec<LatestTagInfo> {
        match value {
            serde_json::Value::Array(items) => items
                .iter()
                .filter_map(|item| {
                    if let Some(name) = item.as_str() {
                        let trimmed = name.trim();
                        if trimmed.is_empty() {
                            return None;
                        }
                        return Some(LatestTagInfo {
                            name: trimmed.to_string(),
                            commit_sha: None,
                        });
                    }
                    if let Some(name) = item.get("name").and_then(|v| v.as_str()).map(str::trim) {
                        if name.is_empty() {
                            return None;
                        }
                        let commit_sha = item
                            .get("commit")
                            .and_then(|commit| commit.get("sha"))
                            .and_then(|sha| sha.as_str())
                            .map(str::trim)
                            .filter(|sha| !sha.is_empty())
                            .map(ToOwned::to_owned);
                        return Some(LatestTagInfo {
                            name: name.to_string(),
                            commit_sha,
                        });
                    }
                    item.get("tag")
                        .and_then(|v| v.as_str())
                        .map(str::trim)
                        .filter(|tag| !tag.is_empty())
                        .map(|tag| LatestTagInfo {
                            name: tag.to_string(),
                            commit_sha: None,
                        })
                })
                .collect(),
            serde_json::Value::Object(_) => value
                .get("tags")
                .map(Self::extract_tag_refs_from_value)
                .unwrap_or_default(),
            _ => Vec::new(),
        }
    }

    fn select_latest_prefixed_tag(tags: Vec<LatestTagInfo>, prefix: &str) -> Option<LatestTagInfo> {
        let mut best_semver: Option<(SimpleSemver, LatestTagInfo)> = None;

        for tag in tags {
            let normalized_name = match Self::normalize_prefixed_tag(&tag.name, prefix) {
                Some(value) => value,
                None => continue,
            };
            if let Some(version) = Self::parse_prefixed_semver(&normalized_name, prefix) {
                match best_semver.as_ref() {
                    Some((best_version, _)) if &version <= best_version => {}
                    _ => {
                        best_semver = Some((
                            version,
                            LatestTagInfo {
                                name: normalized_name.clone(),
                                commit_sha: tag.commit_sha.clone(),
                            },
                        ))
                    }
                }
            }
        }

        best_semver.map(|(_, tag)| tag)
    }

    fn normalize_prefixed_tag(tag: &str, prefix: &str) -> Option<String> {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            return None;
        }
        if !trimmed.starts_with(prefix) {
            return None;
        }
        Some(trimmed.to_string())
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
        Some(SimpleSemver {
            major,
            minor,
            patch,
        })
    }

    fn is_repo_up_to_date(
        repo_dir: &Path,
        current: Option<&str>,
        latest: Option<&LatestTagInfo>,
        prefix: &str,
    ) -> bool {
        let contains_latest_commit = latest
            .and_then(|tag| tag.commit_sha.as_deref())
            .and_then(|commit_sha| Self::head_contains_commit(repo_dir, commit_sha));
        Self::is_repo_up_to_date_from_sources(
            current,
            latest.map(|tag| tag.name.as_str()),
            prefix,
            contains_latest_commit,
        )
    }

    fn is_repo_up_to_date_from_sources(
        current: Option<&str>,
        latest: Option<&str>,
        prefix: &str,
        contains_latest_commit: Option<bool>,
    ) -> bool {
        if contains_latest_commit == Some(true) {
            return true;
        }

        Self::is_current_tag_up_to_date(current, latest, prefix)
    }

    fn head_contains_commit(repo_dir: &Path, commit_sha: &str) -> Option<bool> {
        if !repo_dir.exists() {
            return None;
        }

        let output = Command::new("git")
            .args(["merge-base", "--is-ancestor", commit_sha, "HEAD"])
            .current_dir(repo_dir)
            .output()
            .ok()?;

        match output.status.code() {
            Some(0) => Some(true),
            Some(1) => Some(false),
            _ => None,
        }
    }

    fn is_current_tag_up_to_date(
        current: Option<&str>,
        latest: Option<&str>,
        prefix: &str,
    ) -> bool {
        match (current, latest) {
            (Some(current_tag), Some(latest_tag)) => {
                match (
                    Self::parse_prefixed_semver(current_tag, prefix),
                    Self::parse_prefixed_semver(latest_tag, prefix),
                ) {
                    (Some(current_version), Some(latest_version)) => {
                        current_version >= latest_version
                    }
                    _ => current_tag == latest_tag,
                }
            }
            (None, Some(_)) => false,
            _ => true,
        }
    }

    fn emit_step(
        emit: Option<&dyn Fn(SetupProgress)>,
        step: &str,
        status: &str,
        message: Option<String>,
    ) {
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
#[path = "tests/kiosk_update_service_tests.rs"]
mod kiosk_update_service_tests;
