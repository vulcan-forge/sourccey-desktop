use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::services::directory::directory_service::DirectoryService;
use crate::services::environment::build_service::BuildService;
use crate::services::log::log_service::LogService;

pub struct LocalSetupService;

#[derive(Clone, Serialize)]
pub struct SetupProgress {
    pub step: String,
    pub status: String,
    pub message: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct SetupStatus {
    pub installed: bool,
    pub missing: Vec<String>,
}

#[derive(Clone, Serialize)]
pub struct DesktopExtrasStatus {
    pub installed: bool,
    pub missing: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LerobotUpdateStatus {
    pub up_to_date: bool,
    pub current_commit: Option<String>,
    pub latest_commit: Option<String>,
    pub current_tag: Option<String>,
    pub latest_tag: Option<String>,
}

#[derive(Clone, Deserialize)]
struct UpdaterManifest {
    pub modules: Option<ModulesManifest>,
}

#[derive(Clone, Deserialize)]
struct ModulesManifest {
    #[serde(rename = "lerobot-vulcan")]
    pub lerobot_vulcan: Option<LerobotModuleManifest>,
}

#[derive(Clone, Deserialize)]
struct LerobotModuleManifest {
    pub commit: Option<String>,
    pub tag: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct LerobotCommitMarker {
    pub commit: String,
    pub tag: Option<String>,
}

#[derive(Clone)]
struct LerobotTagCacheEntry {
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
    static ref LEROBOT_TAG_CACHE: Mutex<Option<LerobotTagCacheEntry>> = Mutex::new(None);
}

impl LocalSetupService {
    const DEFAULT_LEROBOT_ZIP_URL: &str = "https://sourccey-staging.nyc3.cdn.digitaloceanspaces.com/updater/lerobot-vulcan.zip";
    const DEFAULT_LEROBOT_ZIP_SHA256_URL: &str =
        "https://sourccey-staging.nyc3.cdn.digitaloceanspaces.com/updater/lerobot-vulcan.zip.sha256";
    const DEFAULT_UPDATER_URL: &str = "https://sourccey-staging.nyc3.digitaloceanspaces.com/updater/latest.json";
    const DEFAULT_LEROBOT_TAGS_URL: &str = "https://api.github.com/repos/vulcan-forge/lerobot-vulcan/tags?per_page=100";
    const LEROBOT_TAG_CACHE_TTL: Duration = Duration::from_secs(300);
    const UV_VENV_PYTHON_VERSION: &str = "3.12";
    #[allow(dead_code)]
    pub fn maybe_start(app_handle: AppHandle, kiosk: bool) {
        if kiosk || BuildService::is_dev_mode() {
            return;
        }

        std::thread::spawn(move || {
            if let Err(e) = Self::ensure_installed(&app_handle, None, true) {
                eprintln!("[setup] {}", e);
                app_handle
                    .dialog()
                    .message(format!(
                        "Sourccey setup failed.\n\n{}",
                        e
                    ))
                    .title("Setup Failed")
                    .kind(MessageDialogKind::Error)
                    .show(|_| {});
            }
        });
    }

    pub fn check_status(app_handle: &AppHandle) -> Result<SetupStatus, String> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data directory: {}", e))?;

        let setup_dir = app_data_dir.join("setup");
        let marker_path = setup_dir.join("lerobot_vulcan_installed");
        let install_root = if BuildService::is_dev_mode() {
            DirectoryService::get_current_dir_dev()?.join("modules")
        } else {
            app_data_dir.join("modules")
        };
        let lerobot_dir = install_root.join("lerobot-vulcan");
        let python_path = Self::python_path_for(&lerobot_dir);

        let mut missing = Vec::new();
        if !lerobot_dir.exists() {
            missing.push("modules/lerobot-vulcan".to_string());
        }
        if !python_path.exists() {
            missing.push("lerobot-vulcan/.venv".to_string());
        }
        if !marker_path.exists() {
            missing.push("setup marker".to_string());
        }

        Ok(SetupStatus {
            installed: missing.is_empty(),
            missing,
        })
    }

    pub fn check_desktop_extras(app_handle: &AppHandle) -> Result<DesktopExtrasStatus, String> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data directory: {}", e))?;

        let setup_dir = app_data_dir.join("setup");
        let marker_path = Self::desktop_extras_marker_path(&setup_dir);
        let lerobot_dir = if BuildService::is_dev_mode() {
            DirectoryService::get_current_dir_dev()?
                .join("modules")
                .join("lerobot-vulcan")
        } else {
            app_data_dir.join("modules").join("lerobot-vulcan")
        };
        let python_path = Self::python_path_for(&lerobot_dir);

        let mut missing = Vec::new();
        if !lerobot_dir.exists() {
            missing.push("modules/lerobot-vulcan".to_string());
        }
        if !python_path.exists() {
            missing.push("lerobot-vulcan/.venv".to_string());
        }
        if !marker_path.exists() {
            missing.push("desktop extras marker".to_string());
        }
        if python_path.exists() && !Self::python_can_import(&python_path, "transformers") {
            missing.push("xvla bindings".to_string());
        }

        Ok(DesktopExtrasStatus {
            installed: missing.is_empty(),
            missing,
        })
    }

    pub fn run_setup(app_handle: &AppHandle, force: bool) -> Result<(), String> {
        let emit = |progress: SetupProgress| {
            let _ = app_handle.emit("setup:progress", progress);
        };
        if let Ok(status) = Self::check_status(app_handle) {
            if status.installed && !force {
                Self::emit_step(
                    Some(&emit),
                    "complete",
                    "success",
                    Some("Setup already complete".to_string()),
                );
                return Ok(());
            }
            if status.installed && force {
                return Self::reinstall_dependencies(app_handle, Some(&emit));
            }
        }
        if let Err(error) = Self::ensure_installed(app_handle, Some(&emit), false) {
            Self::write_setup_log(app_handle, &error);
            return Err(error);
        }
        Ok(())
    }

    pub fn check_lerobot_update(app_handle: &AppHandle) -> Result<LerobotUpdateStatus, String> {
        let latest_tag = Self::resolve_latest_lerobot_tag();
        let current_tag = Self::resolve_current_lerobot_tag(app_handle);
        let current_commit = Self::resolve_current_lerobot_commit(app_handle);
        let latest_commit = latest_tag.clone();
        let up_to_date = Self::is_current_tag_up_to_date(current_tag.as_deref(), latest_tag.as_deref());

        Ok(LerobotUpdateStatus {
            up_to_date,
            current_commit,
            latest_commit,
            current_tag,
            latest_tag,
        })
    }

    pub fn reset_modules(app_handle: &AppHandle) -> Result<(), String> {
        let emit = |progress: SetupProgress| {
            let _ = app_handle.emit("setup:progress", progress);
        };

        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data directory: {}", e))?;
        let setup_dir = app_data_dir.join("setup");
        let marker_path = setup_dir.join("lerobot_vulcan_installed");
        let desktop_extras_marker = Self::desktop_extras_marker_path(&setup_dir);
        let commit_marker = setup_dir.join("lerobot_vulcan_commit.json");

        let install_root = if BuildService::is_dev_mode() {
            DirectoryService::get_current_dir_dev()?.join("modules")
        } else {
            app_data_dir.join("modules")
        };
        let lerobot_dir = install_root.join("lerobot-vulcan");

        Self::emit_step(
            Some(&emit),
            "reset",
            "started",
            Some("Removing lerobot-vulcan runtime".to_string()),
        );

        if lerobot_dir.exists() {
            fs::remove_dir_all(&lerobot_dir)
                .map_err(|e| format!("Failed to remove lerobot-vulcan: {}", e))?;
        }

        if marker_path.exists() {
            fs::remove_file(&marker_path)
                .map_err(|e| format!("Failed to remove setup marker: {}", e))?;
        }

        if desktop_extras_marker.exists() {
            fs::remove_file(&desktop_extras_marker)
                .map_err(|e| format!("Failed to remove desktop extras marker: {}", e))?;
        }
        if commit_marker.exists() {
            fs::remove_file(&commit_marker)
                .map_err(|e| format!("Failed to remove commit marker: {}", e))?;
        }

        Self::emit_step(
            Some(&emit),
            "reset",
            "success",
            Some("Reset complete. Reinstalling modules.".to_string()),
        );

        if let Err(error) = Self::ensure_installed(app_handle, Some(&emit), false) {
            Self::write_setup_log(app_handle, &error);
            return Err(error);
        }
        Ok(())
    }

    pub fn run_desktop_extras(app_handle: &AppHandle) -> Result<(), String> {
        let emit = |progress: SetupProgress| {
            let _ = app_handle.emit("setup:desktop-extras-progress", progress);
        };
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data directory: {}", e))?;

        let setup_dir = app_data_dir.join("setup");
        let marker_path = Self::desktop_extras_marker_path(&setup_dir);
        let lerobot_dir = if BuildService::is_dev_mode() {
            DirectoryService::get_current_dir_dev()?
                .join("modules")
                .join("lerobot-vulcan")
        } else {
            app_data_dir.join("modules").join("lerobot-vulcan")
        };
        let python_path = Self::python_path_for(&lerobot_dir);

        if !lerobot_dir.exists() {
            Self::emit_step(
                Some(&emit),
                "check",
                "error",
                Some("lerobot-vulcan not found. Run the initial setup first.".to_string()),
            );
            return Err("lerobot-vulcan not found. Run the initial setup first.".to_string());
        }
        if !python_path.exists() {
            Self::emit_step(
                Some(&emit),
                "check",
                "error",
                Some("lerobot-vulcan virtual environment not found. Run the initial setup first.".to_string()),
            );
            return Err("lerobot-vulcan virtual environment not found. Run the initial setup first.".to_string());
        }

        fs::create_dir_all(&setup_dir)
            .map_err(|e| format!("Failed to create setup directory: {}", e))?;

        Self::emit_step(
            Some(&emit),
            "uv",
            "started",
            Some("Preparing uv runtime".to_string()),
        );
        let uv_target = Self::ensure_uv_binary(app_handle, &app_data_dir)?;
        Self::emit_step(Some(&emit), "uv", "success", None);

        Self::emit_step(
            Some(&emit),
            "deps",
            "started",
            Some("Installing Sourccey desktop extras".to_string()),
        );
        Self::run_command(
            &uv_target,
            &["pip", "install", "-e", ".[sourccey-desktop,xvla]"],
            &lerobot_dir,
            "uv pip install sourccey-desktop",
        )?;
        Self::emit_step(Some(&emit), "deps", "success", None);

        Self::emit_step(
            Some(&emit),
            "xvla",
            "started",
            Some("Verifying XVLA bindings".to_string()),
        );
        if !Self::python_can_import(&python_path, "transformers") {
            Self::emit_step(
                Some(&emit),
                "xvla",
                "error",
                Some("XVLA bindings missing (transformers import failed)".to_string()),
            );
            return Err("XVLA bindings missing. Ensure xvla extras are installed.".to_string());
        }
        Self::emit_step(Some(&emit), "xvla", "success", None);

        fs::write(&marker_path, "ok")
            .map_err(|e| format!("Failed to write desktop extras marker: {}", e))?;

        Self::emit_step(
            Some(&emit),
            "complete",
            "success",
            Some("Desktop extras installed".to_string()),
        );
        Ok(())
    }

    fn ensure_installed(
        app_handle: &AppHandle,
        emit: Option<&dyn Fn(SetupProgress)>,
        show_dialogs: bool,
    ) -> Result<(), String> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data directory: {}", e))?;

        let setup_dir = app_data_dir.join("setup");
        let marker_path = setup_dir.join("lerobot_vulcan_installed");
        let install_root = if BuildService::is_dev_mode() {
            DirectoryService::get_current_dir_dev()?.join("modules")
        } else {
            app_data_dir.join("modules")
        };
        let lerobot_dir = install_root.join("lerobot-vulcan");
        let python_path = Self::python_path_for(&lerobot_dir);

        if marker_path.exists() && python_path.exists() {
            DirectoryService::set_project_root_override(app_data_dir);
            return Ok(());
        }

        if show_dialogs {
            app_handle
                .dialog()
                .message("Setting up local robot runtime. This may take a few minutes.")
                .title("Setting Up")
                .kind(MessageDialogKind::Info)
                .show(|_| {});
        }

        fs::create_dir_all(&setup_dir)
            .map_err(|e| format!("Failed to create setup directory: {}", e))?;

        if !lerobot_dir.exists() {
            Self::emit_step(emit, "download", "started", Some("Downloading lerobot-vulcan".to_string()));
            let zip_url = std::env::var("SOURCCEY_LEROBOT_ZIP_URL")
                .unwrap_or_else(|_| Self::DEFAULT_LEROBOT_ZIP_URL.to_string());
            if zip_url.trim().is_empty() {
                Self::emit_step(emit, "download", "error", Some("Missing lerobot-vulcan zip URL".to_string()));
                return Err("SOURCCEY_LEROBOT_ZIP_URL is not set. Provide a zip URL for lerobot-vulcan.".to_string());
            }

            fs::create_dir_all(&install_root)
                .map_err(|e| format!("Failed to create install root: {}", e))?;

            let zip_path = setup_dir.join("lerobot-vulcan.zip");
            Self::download_file(&zip_url, &zip_path).map_err(|e| {
                Self::emit_step(emit, "download", "error", Some(e.clone()));
                e
            })?;
            Self::emit_step(emit, "download", "success", None);

            let enforce_checksum = std::env::var("SOURCCEY_ENFORCE_LEROBOT_CHECKSUM")
                .ok()
                .map(|v| {
                    let normalized = v.trim().to_ascii_lowercase();
                    normalized == "1" || normalized == "true" || normalized == "yes"
                })
                .unwrap_or(false);
            if enforce_checksum {
                Self::emit_step(
                    emit,
                    "verify",
                    "started",
                    Some("Verifying lerobot-vulcan archive integrity".to_string()),
                );
                let expected_sha256 = Self::resolve_lerobot_zip_sha256(&zip_url).map_err(|e| {
                    Self::emit_step(emit, "verify", "error", Some(e.clone()));
                    e
                })?;
                Self::verify_file_sha256(&zip_path, &expected_sha256).map_err(|e| {
                    Self::emit_step(emit, "verify", "error", Some(e.clone()));
                    e
                })?;
                Self::emit_step(emit, "verify", "success", None);
            } else {
                Self::emit_step(
                    emit,
                    "verify",
                    "success",
                    Some("Checksum verification skipped (SOURCCEY_ENFORCE_LEROBOT_CHECKSUM is disabled)".to_string()),
                );
            }

            Self::emit_step(emit, "extract", "started", Some("Extracting lerobot-vulcan".to_string()));
            Self::extract_zip(&zip_path, &install_root).map_err(|e| {
                Self::emit_step(emit, "extract", "error", Some(e.clone()));
                e
            })?;
            Self::emit_step(emit, "extract", "success", None);

            if !lerobot_dir.exists() {
                Self::emit_step(emit, "extract", "error", Some("lerobot-vulcan folder not found after extract".to_string()));
                return Err(format!(
                    "lerobot-vulcan not found after extracting zip into {:?}",
                    install_root
                ));
            }
        } else {
            Self::emit_step(
                emit,
                "download",
                "success",
                Some("lerobot-vulcan already present".to_string()),
            );
            Self::emit_step(
                emit,
                "extract",
                "success",
                Some("lerobot-vulcan already extracted".to_string()),
            );
        }

        Self::emit_step(emit, "uv", "started", Some("Installing uv runtime".to_string()));
        let uv_target = Self::ensure_uv_binary(app_handle, &app_data_dir).map_err(|e| {
            Self::emit_step(emit, "uv", "error", Some(e.clone()));
            e
        })?;
        Self::emit_step(emit, "uv", "success", None);

        Self::emit_step(emit, "venv", "started", Some("Creating virtual environment".to_string()));
        let venv_args = Self::uv_venv_args();
        Self::run_command(&uv_target, &venv_args, &lerobot_dir, "uv venv").map_err(|e| {
            Self::emit_step(emit, "venv", "error", Some(e.clone()));
            e
        })?;
        Self::emit_step(emit, "venv", "success", None);

        Self::emit_step(emit, "deps", "started", Some("Installing dependencies".to_string()));
        if let Err(err) = Self::run_command(
            &uv_target,
            &["pip", "install", "-e", ".[sourccey]"],
            &lerobot_dir,
            "uv pip install",
        ) {
            let lower = err.to_lowercase();
            let is_macos_or_windows = cfg!(target_os = "macos") || cfg!(target_os = "windows");
            if is_macos_or_windows && (lower.contains("vosk") || lower.contains("no solution found")) {
                Self::emit_step(
                    emit,
                    "deps",
                    "started",
                    Some("vosk not available on this platform; installing core dependencies".to_string()),
                );
                Self::run_command(
                    &uv_target,
                    &["pip", "install", "-e", "."],
                    &lerobot_dir,
                    "uv pip install (core)",
                )
                .map_err(|e| {
                    Self::emit_step(emit, "deps", "error", Some(e.clone()));
                    e
                })?;
            } else {
                Self::emit_step(emit, "deps", "error", Some(err.clone()));
                return Err(err);
            }
        }
        Self::emit_step(emit, "deps", "success", None);

        let compile_script = lerobot_dir
            .join("src")
            .join("lerobot")
            .join("robots")
            .join("sourccey")
            .join("sourccey")
            .join("protobuf")
            .join("compile.py");
        if compile_script.exists() {
            Self::emit_step(emit, "protobuf", "started", Some("Compiling protobuf".to_string()));
            let compile_script_str = compile_script.to_string_lossy().to_string();
            Self::run_command(
                &python_path,
                &[compile_script_str.as_str()],
                &lerobot_dir,
                "compile protobuf",
            )
            .map_err(|e| {
                let formatted = Self::format_protobuf_error(&e);
                Self::emit_step(emit, "protobuf", "error", Some(formatted.clone()));
                formatted
            })?;
            Self::emit_step(emit, "protobuf", "success", None);
        } else {
            Self::emit_step(
                emit,
                "protobuf",
                "success",
                Some("Protobuf compile step skipped".to_string()),
            );
        }

        fs::write(&marker_path, "ok")
            .map_err(|e| format!("Failed to write setup marker: {}", e))?;

        Self::persist_current_lerobot_marker(&setup_dir, app_handle);

        DirectoryService::set_project_root_override(app_data_dir);

        if show_dialogs {
            app_handle
                .dialog()
                .message("Local robot runtime setup complete.")
                .title("Setup Complete")
                .kind(MessageDialogKind::Info)
                .show(|_| {});
        }

        Self::emit_step(emit, "complete", "success", Some("Setup complete".to_string()));

        Ok(())
    }

    fn fetch_latest_lerobot_commit() -> Result<Option<String>, String> {
        let url = std::env::var("SOURCCEY_UPDATER_URL")
            .unwrap_or_else(|_| Self::DEFAULT_UPDATER_URL.to_string());
        let response = reqwest::blocking::get(&url)
            .map_err(|e| format!("Failed to download updater manifest: {}", e))?;
        if !response.status().is_success() {
            return Err(format!("Updater manifest download failed ({}): {}", response.status(), url));
        }
        let manifest: UpdaterManifest = response
            .json()
            .map_err(|e| format!("Invalid updater manifest JSON: {}", e))?;
        Ok(manifest
            .modules
            .and_then(|modules| modules.lerobot_vulcan)
            .and_then(|module| module.tag.or(module.commit)))
    }

    fn resolve_latest_lerobot_tag() -> Option<String> {
        let now = Instant::now();
        let mut cache_guard = match LEROBOT_TAG_CACHE.lock() {
            Ok(guard) => guard,
            Err(_) => {
                return Self::fetch_latest_lerobot_tag_from_api().ok().flatten();
            }
        };

        match Self::resolve_latest_tag_with_cache(&mut cache_guard, now, || Self::fetch_latest_lerobot_tag_from_api()) {
            Ok(tag) => tag,
            Err(error) => {
                eprintln!("[setup] Failed to resolve latest lerobot tag: {}", error);
                None
            }
        }
    }

    fn resolve_latest_tag_with_cache<F>(
        cache: &mut Option<LerobotTagCacheEntry>,
        now: Instant,
        fetch_latest_tag: F,
    ) -> Result<Option<String>, String>
    where
        F: FnOnce() -> Result<Option<String>, String>,
    {
        if let Some(entry) = cache.as_ref() {
            if now.duration_since(entry.fetched_at) <= Self::LEROBOT_TAG_CACHE_TTL {
                return Ok(entry.latest_tag.clone());
            }
        }

        let latest_tag = fetch_latest_tag()?;
        *cache = Some(LerobotTagCacheEntry {
            fetched_at: now,
            latest_tag: latest_tag.clone(),
        });
        Ok(latest_tag)
    }

    fn fetch_latest_lerobot_tag_from_api() -> Result<Option<String>, String> {
        let url = std::env::var("SOURCCEY_LEROBOT_TAGS_URL")
            .unwrap_or_else(|_| Self::DEFAULT_LEROBOT_TAGS_URL.to_string());

        let client = reqwest::blocking::Client::builder()
            .build()
            .map_err(|e| format!("Failed to create HTTP client for lerobot tags: {}", e))?;
        let response = client
            .get(&url)
            .header(reqwest::header::USER_AGENT, "VulcanStudio/lerobot-tag-check")
            .send()
            .map_err(|e| format!("Failed to download lerobot tags: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Lerobot tag request failed ({}): {}", response.status(), url));
        }

        let payload: serde_json::Value = response
            .json()
            .map_err(|e| format!("Invalid lerobot tags payload: {}", e))?;
        let tags = Self::extract_tag_names_from_value(&payload);
        Ok(Self::select_latest_vulcan_tag(tags))
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

    fn select_latest_vulcan_tag(tags: Vec<String>) -> Option<String> {
        let mut best_semver: Option<(SimpleSemver, String)> = None;

        for tag in tags {
            let trimmed = tag.trim();
            if !trimmed.starts_with("vulcan/") {
                continue;
            }
            let normalized = trimmed.to_string();
            if let Some(version) = Self::parse_vulcan_semver(&normalized) {
                match best_semver.as_ref() {
                    Some((best_version, _)) if &version <= best_version => {}
                    _ => {
                        best_semver = Some((version, normalized.clone()));
                    }
                }
            }
        }

        best_semver.map(|(_, tag)| tag)
    }

    fn parse_vulcan_semver(tag: &str) -> Option<SimpleSemver> {
        let normalized = Self::normalize_vulcan_tag(tag)?;
        let raw_version = normalized.strip_prefix("vulcan/")?;
        let version = raw_version.strip_prefix('v').unwrap_or(raw_version);
        Self::parse_semver_core(version)
    }

    fn parse_semver_core(value: &str) -> Option<SimpleSemver> {
        let mut segments = value.split('.');
        let major = segments.next()?.parse::<u64>().ok()?;
        let minor = segments.next()?.parse::<u64>().ok()?;
        let patch = segments.next()?.parse::<u64>().ok()?;
        if segments.next().is_some() {
            return None;
        }
        Some(SimpleSemver { major, minor, patch })
    }

    fn normalize_vulcan_tag(tag: &str) -> Option<String> {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            return None;
        }
        if !trimmed.starts_with("vulcan/") {
            return None;
        }
        Some(trimmed.to_string())
    }

    fn is_current_tag_up_to_date(current_tag: Option<&str>, latest_tag: Option<&str>) -> bool {
        match (current_tag, latest_tag) {
            (Some(current), Some(latest)) => match (Self::parse_vulcan_semver(current), Self::parse_vulcan_semver(latest)) {
                (Some(current_version), Some(latest_version)) => current_version >= latest_version,
                _ => current == latest,
            },
            (None, Some(_)) => false,
            _ => true,
        }
    }

    fn persist_current_lerobot_marker(setup_dir: &Path, app_handle: &AppHandle) {
        let current_tag = Self::read_current_lerobot_git_tag(app_handle);
        let latest_tag = if current_tag.is_some() {
            None
        } else {
            Self::resolve_latest_lerobot_tag()
        };
        let marker_tag = current_tag.or(latest_tag);
        let marker_commit = Self::read_current_lerobot_git_commit(app_handle)
            .or_else(|| Self::fetch_latest_lerobot_commit().ok().flatten())
            .or_else(|| marker_tag.clone());

        if let Some(commit) = marker_commit {
            let _ = Self::write_current_lerobot_commit_with_tag(setup_dir, &commit, marker_tag);
        }
    }

    fn write_current_lerobot_commit_with_tag(
        setup_dir: &Path,
        commit: &str,
        tag: Option<String>,
    ) -> Result<(), String> {
        let marker = LerobotCommitMarker {
            commit: commit.to_string(),
            tag,
        };
        let json = serde_json::to_string_pretty(&marker)
            .map_err(|e| format!("Failed to serialize commit marker: {}", e))?;
        let marker_path = setup_dir.join("lerobot_vulcan_commit.json");
        fs::write(marker_path, json)
            .map_err(|e| format!("Failed to write commit marker: {}", e))?;
        Ok(())
    }

    fn resolve_current_lerobot_commit(app_handle: &AppHandle) -> Option<String> {
        Self::read_current_lerobot_git_commit(app_handle)
            .or_else(|| Self::read_current_lerobot_commit_marker(app_handle))
    }

    fn resolve_current_lerobot_tag(app_handle: &AppHandle) -> Option<String> {
        Self::read_current_lerobot_git_tag(app_handle)
            .or_else(|| Self::read_current_lerobot_tag_marker(app_handle))
    }

    fn read_current_lerobot_marker(app_handle: &AppHandle) -> Option<LerobotCommitMarker> {
        let app_data_dir = app_handle.path().app_data_dir().ok()?;
        let marker_path = app_data_dir.join("setup").join("lerobot_vulcan_commit.json");
        let contents = fs::read_to_string(marker_path).ok()?;
        serde_json::from_str(&contents).ok()
    }

    fn read_current_lerobot_commit_marker(app_handle: &AppHandle) -> Option<String> {
        let marker = Self::read_current_lerobot_marker(app_handle)?;
        // Prefer tag if present, else commit
        marker.tag.or(Some(marker.commit))
    }

    fn read_current_lerobot_tag_marker(app_handle: &AppHandle) -> Option<String> {
        let marker = Self::read_current_lerobot_marker(app_handle)?;
        marker
            .tag
            .or_else(|| Self::normalize_vulcan_tag(&marker.commit))
    }

    fn read_current_lerobot_git_tag(app_handle: &AppHandle) -> Option<String> {
        let lerobot_dir = Self::resolve_lerobot_dir(app_handle)?;
        if !lerobot_dir.exists() {
            return None;
        }

        let output = Command::new("git")
            .args(["tag", "--points-at", "HEAD"])
            .current_dir(&lerobot_dir)
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
        Self::select_latest_vulcan_tag(tags)
    }

    fn resolve_lerobot_dir(app_handle: &AppHandle) -> Option<PathBuf> {
        if BuildService::is_dev_mode() {
            DirectoryService::get_current_dir_dev()
                .ok()
                .map(|path| path.join("modules").join("lerobot-vulcan"))
        } else {
            let app_data_dir = app_handle.path().app_data_dir().ok()?;
            Some(app_data_dir.join("modules").join("lerobot-vulcan"))
        }
    }

    fn read_current_lerobot_git_commit(app_handle: &AppHandle) -> Option<String> {
        let lerobot_dir = Self::resolve_lerobot_dir(app_handle)?;
        if !lerobot_dir.exists() {
            return None;
        }

        let output = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&lerobot_dir)
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }

        let commit = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if commit.is_empty() {
            None
        } else {
            Some(commit)
        }
    }

    fn reinstall_dependencies(
        app_handle: &AppHandle,
        emit: Option<&dyn Fn(SetupProgress)>,
    ) -> Result<(), String> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data directory: {}", e))?;

        let setup_dir = app_data_dir.join("setup");
        let marker_path = setup_dir.join("lerobot_vulcan_installed");
        let lerobot_dir = if BuildService::is_dev_mode() {
            DirectoryService::get_current_dir_dev()?
                .join("modules")
                .join("lerobot-vulcan")
        } else {
            app_data_dir.join("modules").join("lerobot-vulcan")
        };
        let python_path = Self::python_path_for(&lerobot_dir);

        if !lerobot_dir.exists() || !python_path.exists() {
            return Self::ensure_installed(app_handle, emit, false);
        }

        fs::create_dir_all(&setup_dir)
            .map_err(|e| format!("Failed to create setup directory: {}", e))?;

        Self::emit_step(
            emit,
            "download",
            "success",
            Some("lerobot-vulcan already present".to_string()),
        );
        Self::emit_step(
            emit,
            "extract",
            "success",
            Some("lerobot-vulcan already extracted".to_string()),
        );

        Self::emit_step(emit, "uv", "started", Some("Preparing uv runtime".to_string()));
        let uv_target = Self::ensure_uv_binary(app_handle, &app_data_dir)?;
        Self::emit_step(emit, "uv", "success", None);

        Self::emit_step(
            emit,
            "venv",
            "success",
            Some("Using existing virtual environment".to_string()),
        );

        Self::emit_step(emit, "deps", "started", Some("Reinstalling dependencies".to_string()));
        if let Err(err) = Self::run_command(
            &uv_target,
            &["pip", "install", "-e", ".[sourccey]"],
            &lerobot_dir,
            "uv pip install",
        ) {
            let lower = err.to_lowercase();
            let is_macos_or_windows = cfg!(target_os = "macos") || cfg!(target_os = "windows");
            if is_macos_or_windows && (lower.contains("vosk") || lower.contains("no solution found")) {
                Self::emit_step(
                    emit,
                    "deps",
                    "started",
                    Some("vosk not available on this platform; installing core dependencies".to_string()),
                );
                Self::run_command(
                    &uv_target,
                    &["pip", "install", "-e", "."],
                    &lerobot_dir,
                    "uv pip install (core)",
                )
                .map_err(|e| {
                    Self::emit_step(emit, "deps", "error", Some(e.clone()));
                    e
                })?;
            } else {
                Self::emit_step(emit, "deps", "error", Some(err.clone()));
                return Err(err);
            }
        }
        Self::emit_step(emit, "deps", "success", None);

        let compile_script = lerobot_dir
            .join("src")
            .join("lerobot")
            .join("robots")
            .join("sourccey")
            .join("sourccey")
            .join("protobuf")
            .join("compile.py");
        if compile_script.exists() {
            Self::emit_step(emit, "protobuf", "started", Some("Compiling protobuf".to_string()));
            let compile_script_str = compile_script.to_string_lossy().to_string();
            Self::run_command(
                &python_path,
                &[compile_script_str.as_str()],
                &lerobot_dir,
                "compile protobuf",
            )
            .map_err(|e| {
                let formatted = Self::format_protobuf_error(&e);
                Self::emit_step(emit, "protobuf", "error", Some(formatted.clone()));
                formatted
            })?;
            Self::emit_step(emit, "protobuf", "success", None);
        } else {
            Self::emit_step(
                emit,
                "protobuf",
                "success",
                Some("Protobuf compile step skipped".to_string()),
            );
        }

        fs::write(&marker_path, "ok")
            .map_err(|e| format!("Failed to write setup marker: {}", e))?;

        Self::persist_current_lerobot_marker(&setup_dir, app_handle);

        DirectoryService::set_project_root_override(app_data_dir);

        Self::emit_step(emit, "complete", "success", Some("Setup complete".to_string()));

        Ok(())
    }

    fn run_command(
        exe: &Path,
        args: &[&str],
        working_dir: &Path,
        label: &str,
    ) -> Result<(), String> {
        if !exe.exists() {
            return Err(format!("{} executable not found at: {:?}", label, exe));
        }

        let output = Command::new(exe)
            .args(args)
            .current_dir(working_dir)
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUTF8", "1")
            .output()
            .map_err(|e| format!("Failed to run {}: {}", label, e))?;

        if !output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let mut details = String::new();
            if !stdout.trim().is_empty() {
                details.push_str(&format!("\nstdout: {}", stdout.trim()));
            }
            if !stderr.trim().is_empty() {
                details.push_str(&format!("\nstderr: {}", stderr.trim()));
            }
            return Err(format!(
                "{} failed with status: {}{}",
                label, output.status, details
            ));
        }

        Ok(())
    }

    fn uv_venv_args() -> [&'static str; 4] {
        ["venv", "--clear", "--python", Self::UV_VENV_PYTHON_VERSION]
    }

    fn format_protobuf_error(error: &str) -> String {
        format!(
            "Compile protobuf failed.\n\nCompiler output:\n{}",
            error.trim()
        )
    }

    fn python_can_import(python_path: &Path, module: &str) -> bool {
        if !python_path.exists() {
            return false;
        }
        let code = format!("import {}", module);
        Command::new(python_path)
            .args(["-c", code.as_str()])
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    fn download_file(url: &str, dest: &Path) -> Result<(), String> {
        let response = reqwest::blocking::get(url)
            .map_err(|e| format!("Failed to download {}: {}", url, e))?;

        if !response.status().is_success() {
            return Err(format!("Download failed ({}): {}", response.status(), url));
        }

        let mut file = fs::File::create(dest)
            .map_err(|e| format!("Failed to create {:?}: {}", dest, e))?;
        let mut content = io::BufReader::new(response);
        io::copy(&mut content, &mut file)
            .map_err(|e| format!("Failed to write download to {:?}: {}", dest, e))?;
        Ok(())
    }

    fn resolve_lerobot_zip_sha256(zip_url: &str) -> Result<String, String> {
        if let Ok(sha_from_env) = std::env::var("SOURCCEY_LEROBOT_ZIP_SHA256") {
            let trimmed = sha_from_env.trim();
            if !trimmed.is_empty() {
                return Self::normalize_sha256(trimmed);
            }
        }

        let sha_url = std::env::var("SOURCCEY_LEROBOT_ZIP_SHA256_URL").unwrap_or_else(|_| {
            if zip_url == Self::DEFAULT_LEROBOT_ZIP_URL {
                Self::DEFAULT_LEROBOT_ZIP_SHA256_URL.to_string()
            } else {
                format!("{}.sha256", zip_url)
            }
        });

        let response = reqwest::blocking::get(&sha_url)
            .map_err(|e| format!("Failed to download zip checksum {}: {}", sha_url, e))?;
        if !response.status().is_success() {
            return Err(format!(
                "Checksum download failed ({}): {}. Set SOURCCEY_LEROBOT_ZIP_SHA256 or provide a valid SOURCCEY_LEROBOT_ZIP_SHA256_URL.",
                response.status(),
                sha_url
            ));
        }

        let body = response
            .text()
            .map_err(|e| format!("Failed to read checksum payload {}: {}", sha_url, e))?;
        let checksum = body
            .split_whitespace()
            .next()
            .ok_or_else(|| format!("Checksum payload is empty: {}", sha_url))?;
        Self::normalize_sha256(checksum)
    }

    fn normalize_sha256(value: &str) -> Result<String, String> {
        let normalized = value.trim().to_ascii_lowercase();
        if normalized.len() != 64 || !normalized.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(format!("Invalid SHA-256 checksum format: {}", value));
        }
        Ok(normalized)
    }

    fn verify_file_sha256(file_path: &Path, expected_sha256: &str) -> Result<(), String> {
        let normalized_expected = Self::normalize_sha256(expected_sha256)?;
        let file = fs::File::open(file_path)
            .map_err(|e| format!("Failed to open {:?} for checksum verification: {}", file_path, e))?;
        let mut reader = io::BufReader::new(file);
        let mut hasher = Sha256::new();
        let mut buf = [0u8; 8192];
        loop {
            let bytes_read = reader
                .read(&mut buf)
                .map_err(|e| format!("Failed to read {:?} during checksum verification: {}", file_path, e))?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buf[..bytes_read]);
        }
        let actual_sha256 = format!("{:x}", hasher.finalize());
        if actual_sha256 != normalized_expected {
            return Err(format!(
                "Checksum verification failed for {:?}: expected {}, got {}",
                file_path, normalized_expected, actual_sha256
            ));
        }
        Ok(())
    }

    fn extract_zip(zip_path: &Path, target_dir: &Path) -> Result<(), String> {
        let file = fs::File::open(zip_path)
            .map_err(|e| format!("Failed to open {:?}: {}", zip_path, e))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Failed to read zip: {}", e))?;

        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| format!("Zip entry error: {}", e))?;
            let entry_path = match entry.enclosed_name() {
                Some(name) => name.to_owned(),
                None => continue,
            };
            let out_path = target_dir.join(entry_path);

            if entry.is_dir() {
                fs::create_dir_all(&out_path)
                    .map_err(|e| format!("Failed to create directory {:?}: {}", out_path, e))?;
            } else {
                if let Some(parent) = out_path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create directory {:?}: {}", parent, e))?;
                }
                let mut outfile = fs::File::create(&out_path)
                    .map_err(|e| format!("Failed to create {:?}: {}", out_path, e))?;
                io::copy(&mut entry, &mut outfile)
                    .map_err(|e| format!("Failed to write {:?}: {}", out_path, e))?;
            }
        }

        Ok(())
    }

    fn find_uv_binary(resource_dir: &Path) -> Option<PathBuf> {
        #[cfg(windows)]
        let candidates = [
            resource_dir.join("resources").join("uv").join("uv.exe"),
            resource_dir.join("uv").join("uv.exe"),
        ];

        #[cfg(not(windows))]
        let candidates = [
            resource_dir.join("resources").join("uv").join("uv"),
            resource_dir.join("uv").join("uv"),
        ];
        candidates.into_iter().find(|path| path.exists())
    }

    fn find_linux_uv_binary(resource_dir: &Path) -> Option<PathBuf> {
        let candidates = [
            resource_dir.join("resources").join("uv").join("uv"),
            resource_dir.join("uv").join("uv"),
        ];
        candidates.into_iter().find(|path| path.exists())
    }

    fn find_binary_in_path(binary_name: &str) -> Option<PathBuf> {
        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Some(path_var) = std::env::var_os("PATH") {
            candidates.extend(std::env::split_paths(&path_var).map(|dir| dir.join(binary_name)));
        }
        if let Some(home) = std::env::var_os("HOME") {
            let home_path = PathBuf::from(home);
            candidates.push(home_path.join(".local").join("bin").join(binary_name));
            candidates.push(home_path.join(".cargo").join("bin").join(binary_name));
        }
        candidates.push(PathBuf::from("/usr/local/bin").join(binary_name));
        candidates.push(PathBuf::from("/usr/bin").join(binary_name));
        candidates.into_iter().find(|path| path.exists() && path.is_file())
    }

    fn is_command_usable(exe: &Path, args: &[&str]) -> bool {
        if !exe.exists() {
            return false;
        }
        Command::new(exe)
            .args(args)
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    #[cfg(unix)]
    fn ensure_executable(path: &Path) -> Result<(), String> {
        use std::os::unix::fs::PermissionsExt;
        let metadata = fs::metadata(path).map_err(|e| format!("Failed to read uv binary permissions: {}", e))?;
        let mut perms = metadata.permissions();
        let mode = perms.mode();
        if mode & 0o111 == 0 {
            perms.set_mode(mode | 0o755);
            fs::set_permissions(path, perms).map_err(|e| format!("Failed to set uv binary executable bit: {}", e))?;
        }
        Ok(())
    }

    #[cfg(not(unix))]
    fn ensure_executable(_path: &Path) -> Result<(), String> {
        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn install_uv_macos(install_dir: &Path) -> Result<PathBuf, String> {
        fs::create_dir_all(install_dir)
            .map_err(|e| format!("Failed to create uv install directory: {}", e))?;
        let output = Command::new("bash")
            .arg("-lc")
            .arg("curl -LsSf https://astral.sh/uv/install.sh | sh")
            .env("UV_INSTALL_DIR", install_dir)
            .env("UV_NO_PROMPT", "1")
            .output()
            .map_err(|e| format!("Failed to run uv installer: {}", e))?;

        if !output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let mut details = String::new();
            if !stdout.trim().is_empty() {
                details.push_str(&format!("\nstdout: {}", stdout.trim()));
            }
            if !stderr.trim().is_empty() {
                details.push_str(&format!("\nstderr: {}", stderr.trim()));
            }
            return Err(format!("uv installer failed with status: {}{}", output.status, details));
        }

        let uv_path = install_dir.join("uv");
        if !uv_path.exists() {
            if let Some(path) = Self::find_binary_in_path("uv") {
                return Ok(path);
            }
            return Err(format!(
                "uv installer did not produce an executable at {}",
                uv_path.display()
            ));
        }

        Self::ensure_executable(&uv_path)?;
        Ok(uv_path)
    }

    fn ensure_uv_binary(app_handle: &AppHandle, app_data_dir: &Path) -> Result<PathBuf, String> {
        let uv_target_dir = app_data_dir.join("bin");
        if cfg!(target_os = "linux") {
            let linux_uv_target = uv_target_dir.join("uv");
            if Self::is_command_usable(&linux_uv_target, &["--version"]) {
                return Ok(linux_uv_target);
            }
            if let Some(system_uv) = Self::find_binary_in_path("uv") {
                if Self::is_command_usable(&system_uv, &["--version"]) {
                    return Ok(system_uv);
                }
            }
            let resource_dir = app_handle
                .path()
                .resource_dir()
                .map_err(|e| format!("Failed to get resource directory: {}", e))?;
            if let Some(uv_source) = Self::find_linux_uv_binary(&resource_dir) {
                fs::create_dir_all(&uv_target_dir)
                    .map_err(|e| format!("Failed to create bin directory: {}", e))?;
                if !linux_uv_target.exists() {
                    fs::copy(&uv_source, &linux_uv_target)
                        .map_err(|e| format!("Failed to copy uv binary: {}", e))?;
                }
                Self::ensure_executable(&linux_uv_target)?;
                if Self::is_command_usable(&linux_uv_target, &["--version"]) {
                    return Ok(linux_uv_target);
                }
            }
            return Err("Linux setup requires a native `uv` binary. Install uv and retry: https://docs.astral.sh/uv/getting-started/installation/".to_string());
        }
        #[cfg(windows)]
        let existing = [uv_target_dir.join("uv.exe"), uv_target_dir.join("uv")]
            .into_iter()
            .find(|path| path.exists());

        #[cfg(not(windows))]
        let existing = [uv_target_dir.join("uv")]
            .into_iter()
            .find(|path| path.exists());
        if let Some(path) = existing {
            #[cfg(unix)]
            {
                Self::ensure_executable(&path)?;
            }
            if Self::is_command_usable(&path, &["--version"]) {
                return Ok(path);
            }
            return Err(format!("Existing uv binary is not usable: {}", path.display()));
        }

        let resource_dir = app_handle
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource directory: {}", e))?;
        if let Some(uv_source) = Self::find_uv_binary(&resource_dir) {
            let uv_file_name = uv_source
                .file_name()
                .ok_or_else(|| "Bundled uv binary has no filename".to_string())?;
            let uv_target = uv_target_dir.join(uv_file_name);
            fs::create_dir_all(&uv_target_dir)
                .map_err(|e| format!("Failed to create bin directory: {}", e))?;
            if !uv_target.exists() {
                fs::copy(&uv_source, &uv_target)
                    .map_err(|e| format!("Failed to copy uv binary: {}", e))?;
            }

            #[cfg(unix)]
            {
                Self::ensure_executable(&uv_target)?;
            }

            return Ok(uv_target);
        }

        if let Some(uv_path) = Self::find_binary_in_path("uv") {
            if Self::is_command_usable(&uv_path, &["--version"]) {
                return Ok(uv_path);
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Ok(uv_path) = Self::install_uv_macos(&uv_target_dir) {
                return Ok(uv_path);
            }
        }

        Err("Bundled uv binary not found for this platform. Install uv or add it to src-tauri/resources/uv.".to_string())
    }

    fn desktop_extras_marker_path(setup_dir: &Path) -> PathBuf {
        setup_dir.join("lerobot_vulcan_desktop_extras_installed")
    }

    fn python_path_for(lerobot_dir: &Path) -> PathBuf {
        #[cfg(windows)]
        {
            lerobot_dir.join(".venv").join("Scripts").join("python.exe")
        }
        #[cfg(not(windows))]
        {
            lerobot_dir.join(".venv").join("bin").join("python")
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

    fn write_setup_log(app_handle: &AppHandle, message: &str) {
        if let Ok(app_data_dir) = app_handle.path().app_data_dir() {
            let log_dir = app_data_dir.join("logs");
            if fs::create_dir_all(&log_dir).is_ok() {
                let log_path = log_dir.join("setup.log");
                LogService::write_log_line(log_path.to_string_lossy().as_ref(), Some("setup"), message);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_vulcan_semver_tags() {
        assert_eq!(
            LocalSetupService::parse_vulcan_semver("vulcan/0.1.0"),
            Some(SimpleSemver {
                major: 0,
                minor: 1,
                patch: 0
            })
        );
        assert_eq!(
            LocalSetupService::parse_vulcan_semver("vulcan/v1.2.3"),
            Some(SimpleSemver {
                major: 1,
                minor: 2,
                patch: 3
            })
        );
        assert_eq!(LocalSetupService::parse_vulcan_semver("vulcan/not-semver"), None);
        assert_eq!(LocalSetupService::parse_vulcan_semver("0.1.0"), None);
        assert_eq!(LocalSetupService::parse_vulcan_semver("v0.1.0"), None);
    }

    #[test]
    fn selects_highest_vulcan_semver_and_ignores_other_tags() {
        let selected = LocalSetupService::select_latest_vulcan_tag(vec![
            "release/5.0.0".to_string(),
            "1.9.9".to_string(),
            "v2.0.0".to_string(),
            "vulcan/0.1.0".to_string(),
            "vulcan/0.3.0".to_string(),
            "vulcan/0.2.5".to_string(),
        ]);
        assert_eq!(selected, Some("vulcan/0.3.0".to_string()));
    }

    #[test]
    fn ignores_non_semver_vulcan_tags_when_selecting_latest() {
        let selected = LocalSetupService::select_latest_vulcan_tag(vec![
            "vulcan/latest".to_string(),
            "vulcan/release".to_string(),
            "other/1.0.0".to_string(),
        ]);
        assert_eq!(selected, None);
    }

    #[test]
    fn compares_tags_with_semver_and_exact_fallback() {
        assert!(LocalSetupService::is_current_tag_up_to_date(
            Some("vulcan/0.1.0"),
            Some("vulcan/0.1.0")
        ));
        assert!(LocalSetupService::is_current_tag_up_to_date(
            Some("vulcan/0.2.0"),
            Some("vulcan/0.1.0")
        ));
        assert!(!LocalSetupService::is_current_tag_up_to_date(
            Some("vulcan/0.1.0"),
            Some("vulcan/0.2.0")
        ));
        assert!(LocalSetupService::is_current_tag_up_to_date(
            Some("vulcan/release"),
            Some("vulcan/release")
        ));
        assert!(!LocalSetupService::is_current_tag_up_to_date(
            Some("vulcan/release-a"),
            Some("vulcan/release-b")
        ));
    }

    #[test]
    fn reuses_cached_latest_tag_inside_ttl() {
        let mut cache: Option<LerobotTagCacheEntry> = None;
        let start = Instant::now();
        let mut fetch_calls = 0;

        let first = LocalSetupService::resolve_latest_tag_with_cache(&mut cache, start, || {
            fetch_calls += 1;
            Ok(Some("vulcan/0.2.0".to_string()))
        })
        .expect("first cache resolution should succeed");
        assert_eq!(first, Some("vulcan/0.2.0".to_string()));
        assert_eq!(fetch_calls, 1);

        let second = LocalSetupService::resolve_latest_tag_with_cache(
            &mut cache,
            start + Duration::from_secs(60),
            || {
                fetch_calls += 1;
                Ok(Some("vulcan/0.9.0".to_string()))
            },
        )
        .expect("second cache resolution should reuse cache");
        assert_eq!(second, Some("vulcan/0.2.0".to_string()));
        assert_eq!(fetch_calls, 1);

        let third = LocalSetupService::resolve_latest_tag_with_cache(
            &mut cache,
            start + LocalSetupService::LEROBOT_TAG_CACHE_TTL + Duration::from_secs(1),
            || {
                fetch_calls += 1;
                Ok(Some("vulcan/0.9.0".to_string()))
            },
        )
        .expect("third cache resolution should refresh after ttl");
        assert_eq!(third, Some("vulcan/0.9.0".to_string()));
        assert_eq!(fetch_calls, 2);
    }

    #[test]
    fn uv_venv_args_pin_python_312() {
        assert_eq!(
            LocalSetupService::uv_venv_args(),
            ["venv", "--clear", "--python", "3.12"]
        );
    }
}
