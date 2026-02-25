use std::path::Path;
use std::process::{Command, Stdio};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::services::directory::directory_service::DirectoryService;
use crate::services::setup::local_setup_service::SetupProgress;

pub struct KioskUpdateService;

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
    pub fn check_updates(_app_handle: &AppHandle) -> Result<KioskUpdateStatus, String> {
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

        let mut error: Option<String> = None;

        if let Err(err) = Self::run_command("git", &["fetch", "--prune"], &repo_root, "git fetch") {
            error = Some(err);
        }

        let app_current = Self::run_command_output("git", &["rev-parse", "HEAD"], &repo_root).ok();
        let app_remote = Self::run_command_output("git", &["rev-parse", update_ref.as_str()], &repo_root).ok();
        let app_update_available = match (&app_current, &app_remote) {
            (Some(current), Some(remote)) => current != remote,
            _ => false,
        };

        let lerobot_dir = repo_root.join("modules").join("lerobot-vulcan");
        let mut lerobot_current = None;
        let mut lerobot_remote = None;
        let mut lerobot_update_available = false;

        if lerobot_dir.exists() {
            let branch = Self::submodule_branch(&repo_root, "modules/lerobot-vulcan").unwrap_or_else(|| "main".to_string());
            let remote_ref = format!("origin/{}", branch);
            let _ = Self::run_command("git", &["fetch", "--prune"], &lerobot_dir, "git fetch (lerobot)");
            lerobot_current = Self::run_command_output("git", &["rev-parse", "HEAD"], &lerobot_dir).ok();
            lerobot_remote = Self::run_command_output("git", &["rev-parse", remote_ref.as_str()], &lerobot_dir).ok();
            lerobot_update_available = match (&lerobot_current, &lerobot_remote) {
                (Some(current), Some(remote)) => current != remote,
                _ => false,
            };
        }

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

    fn run_command_output(cmd: &str, args: &[&str], cwd: &Path) -> Result<String, String> {
        let output = Command::new(cmd)
            .args(args)
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("Failed to run {}: {}", cmd, e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let details = if !stderr.trim().is_empty() {
                stderr.trim().to_string()
            } else {
                stdout.trim().to_string()
            };
            return Err(details);
        }

        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(value)
    }

    fn submodule_branch(repo_root: &Path, submodule_path: &str) -> Option<String> {
        let key = format!("submodule.{}.branch", submodule_path);
        let output = Command::new("git")
            .args(["config", "-f", ".gitmodules", "--get", key.as_str()])
            .current_dir(repo_root)
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if value.is_empty() {
            None
        } else {
            Some(value)
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
