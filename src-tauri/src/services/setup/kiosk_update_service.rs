use std::path::Path;
use std::process::{Command, Stdio};

use tauri::{AppHandle, Emitter};

use crate::services::directory::directory_service::DirectoryService;
use crate::services::setup::local_setup_service::SetupProgress;

pub struct KioskUpdateService;

impl KioskUpdateService {
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
