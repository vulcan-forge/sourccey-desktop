use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::io::{self};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::services::directory::directory_service::DirectoryService;
use crate::services::environment::build_service::BuildService;

pub struct LocalSetupService;

impl LocalSetupService {
    pub fn maybe_start(app_handle: AppHandle, kiosk: bool) {
        if kiosk || BuildService::is_dev_mode() {
            return;
        }

        std::thread::spawn(move || {
            if let Err(e) = Self::ensure_installed(&app_handle) {
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

    fn ensure_installed(app_handle: &AppHandle) -> Result<(), String> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data directory: {}", e))?;

        let setup_dir = app_data_dir.join("setup");
        let marker_path = setup_dir.join("lerobot_vulcan_installed");
        let install_root = app_data_dir.join("modules");
        let lerobot_dir = install_root.join("lerobot-vulcan");
        let python_path = Self::python_path_for(&lerobot_dir);

        if marker_path.exists() && python_path.exists() {
            DirectoryService::set_project_root_override(app_data_dir);
            return Ok(());
        }

        app_handle
            .dialog()
            .message("Setting up local robot runtime. This may take a few minutes.")
            .title("Setting Up")
            .kind(MessageDialogKind::Info)
            .show(|_| {});

        let resource_dir = app_handle
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource directory: {}", e))?;

        if !lerobot_dir.exists() {
            let zip_url = std::env::var("SOURCCEY_LEROBOT_ZIP_URL")
                .unwrap_or_default();
            if zip_url.trim().is_empty() {
                return Err("SOURCCEY_LEROBOT_ZIP_URL is not set. Provide a zip URL for lerobot-vulcan.".to_string());
            }

            fs::create_dir_all(&install_root)
                .map_err(|e| format!("Failed to create install root: {}", e))?;

            let zip_path = setup_dir.join("lerobot-vulcan.zip");
            Self::download_file(&zip_url, &zip_path)?;
            Self::extract_zip(&zip_path, &install_root)?;

            if !lerobot_dir.exists() {
                return Err(format!(
                    "lerobot-vulcan not found after extracting zip into {:?}",
                    install_root
                ));
            }
        }

        let uv_source = Self::find_uv_binary(&resource_dir)
            .ok_or_else(|| "Bundled uv binary not found. Place uv in src-tauri/resources/uv.".to_string())?;
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

        Self::run_command(&uv_target, &["venv"], &lerobot_dir, "uv venv")?;
        Self::run_command(
            &uv_target,
            &["pip", "install", "-e", ".[sourccey]"],
            &lerobot_dir,
            "uv pip install",
        )?;

        let compile_script = lerobot_dir
            .join("src")
            .join("lerobot")
            .join("robots")
            .join("sourccey")
            .join("sourccey")
            .join("protobuf")
            .join("compile.py");
        if compile_script.exists() {
            let compile_script_str = compile_script.to_string_lossy().to_string();
            Self::run_command(
                &python_path,
                &[compile_script_str.as_str()],
                &lerobot_dir,
                "compile protobuf",
            )?;
        }

        fs::create_dir_all(&setup_dir)
            .map_err(|e| format!("Failed to create setup directory: {}", e))?;
        fs::write(&marker_path, "ok")
            .map_err(|e| format!("Failed to write setup marker: {}", e))?;

        DirectoryService::set_project_root_override(app_data_dir);

        app_handle
            .dialog()
            .message("Local robot runtime setup complete.")
            .title("Setup Complete")
            .kind(MessageDialogKind::Info)
            .show(|_| {});

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
}
