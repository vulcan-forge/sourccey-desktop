use std::fs;
use std::io::{self};
use std::path::{Path, PathBuf};
use std::process::Command;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::services::directory::directory_service::DirectoryService;
use crate::services::environment::build_service::BuildService;

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
}

#[derive(Clone, Serialize, Deserialize)]
struct LerobotCommitMarker {
    pub commit: String,
}

impl LocalSetupService {
    const DEFAULT_LEROBOT_ZIP_URL: &str = "https://sourccey-staging.nyc3.cdn.digitaloceanspaces.com/updater/lerobot-vulcan.zip";
    const DEFAULT_UPDATER_URL: &str = "https://sourccey-staging.nyc3.digitaloceanspaces.com/updater/latest.json";
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
        Self::ensure_installed(app_handle, Some(&emit), false)
    }

    pub fn check_lerobot_update(app_handle: &AppHandle) -> Result<LerobotUpdateStatus, String> {
        let latest_commit = Self::fetch_latest_lerobot_commit()?;
        let current_commit = Self::read_current_lerobot_commit(app_handle);
        let up_to_date = match (&current_commit, &latest_commit) {
            (Some(current), Some(latest)) => current == latest,
            (None, Some(_)) => false,
            _ => true,
        };

        Ok(LerobotUpdateStatus {
            up_to_date,
            current_commit,
            latest_commit,
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

        Self::ensure_installed(app_handle, Some(&emit), false)
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

        let resource_dir = app_handle
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource directory: {}", e))?;

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
        let uv_source = Self::find_uv_binary(&resource_dir).ok_or_else(|| {
            let message = "Bundled uv binary not found. Place uv in src-tauri/resources/uv.".to_string();
            Self::emit_step(emit, "uv", "error", Some(message.clone()));
            message
        })?;
        let uv_target_dir = app_data_dir.join("bin");
        fs::create_dir_all(&uv_target_dir)
            .map_err(|e| format!("Failed to create bin directory: {}", e))?;
        let uv_file_name = uv_source
            .file_name()
            .ok_or_else(|| "Bundled uv binary has no filename".to_string())?;
        let uv_target = uv_target_dir.join(uv_file_name);
        if !uv_target.exists() {
            fs::copy(&uv_source, &uv_target)
                .map_err(|e| format!("Failed to copy uv binary: {}", e))?;
        }
        Self::emit_step(emit, "uv", "success", None);

        Self::emit_step(emit, "venv", "started", Some("Creating virtual environment".to_string()));
        Self::run_command(&uv_target, &["venv", "--clear"], &lerobot_dir, "uv venv").map_err(|e| {
            Self::emit_step(emit, "venv", "error", Some(e.clone()));
            e
        })?;
        Self::emit_step(emit, "venv", "success", None);

        Self::emit_step(emit, "deps", "started", Some("Installing dependencies".to_string()));
        Self::run_command(
            &uv_target,
            &["pip", "install", "-e", ".[sourccey]"],
            &lerobot_dir,
            "uv pip install",
        )
        .map_err(|e| {
            Self::emit_step(emit, "deps", "error", Some(e.clone()));
            e
        })?;
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
                Self::emit_step(emit, "protobuf", "error", Some(e.clone()));
                e
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

        if let Ok(Some(commit)) = Self::fetch_latest_lerobot_commit() {
            let _ = Self::write_current_lerobot_commit(&setup_dir, &commit);
        }

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
            .and_then(|module| module.commit))
    }

    fn write_current_lerobot_commit(setup_dir: &Path, commit: &str) -> Result<(), String> {
        let marker = LerobotCommitMarker {
            commit: commit.to_string(),
        };
        let json = serde_json::to_string_pretty(&marker)
            .map_err(|e| format!("Failed to serialize commit marker: {}", e))?;
        let marker_path = setup_dir.join("lerobot_vulcan_commit.json");
        fs::write(marker_path, json)
            .map_err(|e| format!("Failed to write commit marker: {}", e))?;
        Ok(())
    }

    fn read_current_lerobot_commit(app_handle: &AppHandle) -> Option<String> {
        let app_data_dir = app_handle.path().app_data_dir().ok()?;
        let marker_path = app_data_dir.join("setup").join("lerobot_vulcan_commit.json");
        let contents = fs::read_to_string(marker_path).ok()?;
        let marker: LerobotCommitMarker = serde_json::from_str(&contents).ok()?;
        Some(marker.commit)
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
        Self::run_command(
            &uv_target,
            &["pip", "install", "-e", ".[sourccey]"],
            &lerobot_dir,
            "uv pip install",
        )
        .map_err(|e| {
            Self::emit_step(emit, "deps", "error", Some(e.clone()));
            e
        })?;
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
                Self::emit_step(emit, "protobuf", "error", Some(e.clone()));
                e
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

        if let Ok(Some(commit)) = Self::fetch_latest_lerobot_commit() {
            let _ = Self::write_current_lerobot_commit(&setup_dir, &commit);
        }

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

        let status = Command::new(exe)
            .args(args)
            .current_dir(working_dir)
            .status()
            .map_err(|e| format!("Failed to run {}: {}", label, e))?;

        if !status.success() {
            return Err(format!("{} failed with status: {}", label, status));
        }

        Ok(())
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
        let candidates = [
            resource_dir.join("resources").join("uv").join("uv.exe"),
            resource_dir.join("resources").join("uv").join("uv"),
            resource_dir.join("uv").join("uv.exe"),
            resource_dir.join("uv").join("uv"),
        ];
        candidates.into_iter().find(|path| path.exists())
    }

    fn ensure_uv_binary(app_handle: &AppHandle, app_data_dir: &Path) -> Result<PathBuf, String> {
        let uv_target_dir = app_data_dir.join("bin");
        let existing = [uv_target_dir.join("uv.exe"), uv_target_dir.join("uv")]
            .into_iter()
            .find(|path| path.exists());
        if let Some(path) = existing {
            return Ok(path);
        }

        let resource_dir = app_handle
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource directory: {}", e))?;
        let uv_source = Self::find_uv_binary(&resource_dir)
            .ok_or_else(|| "Bundled uv binary not found. Place uv in src-tauri/resources/uv.".to_string())?;

        fs::create_dir_all(&uv_target_dir)
            .map_err(|e| format!("Failed to create bin directory: {}", e))?;
        let uv_file_name = uv_source
            .file_name()
            .ok_or_else(|| "Bundled uv binary has no filename".to_string())?;
        let uv_target = uv_target_dir.join(uv_file_name);
        if !uv_target.exists() {
            fs::copy(&uv_source, &uv_target)
                .map_err(|e| format!("Failed to copy uv binary: {}", e))?;
        }
        Ok(uv_target)
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
}
