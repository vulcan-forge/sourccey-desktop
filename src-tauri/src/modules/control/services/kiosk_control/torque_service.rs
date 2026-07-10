use crate::modules::control::services::kiosk_control::kiosk_host_service::{
    KioskHostProcess, KioskHostService,
};
use crate::modules::control::services::kiosk_control::manual_drive_service::{
    KioskManualDriveProcess, KioskManualDriveService,
};
use crate::modules::control::services::remote_control::remote_command_utils::{
    format_command_for_display, resolve_uv_runtime, write_process_log,
};
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::process::Command;
use tauri::{AppHandle, Emitter};

pub struct KioskTorqueService;

impl KioskTorqueService {
    pub async fn untorque_kiosk_robot_arms(
        app_handle: AppHandle,
        db_connection: DatabaseConnection,
        host_state: &KioskHostProcess,
        manual_drive_state: &KioskManualDriveProcess,
        nickname: String,
    ) -> Result<String, String> {
        let normalized_nickname = Self::normalize_nickname(&nickname)?;

        let stop_manual_result = KioskManualDriveService::stop_kiosk_manual_drive(
            manual_drive_state,
            normalized_nickname.clone(),
        );
        if let Err(error) = &stop_manual_result {
            Self::emit_log(
                &app_handle,
                &normalized_nickname,
                &format!("Manual drive stop skipped before untorque: {}", error),
            );
        }

        Self::emit_log(
            &app_handle,
            &normalized_nickname,
            "Stopping kiosk host before untorque so the arm serial ports can be reopened.",
        );

        let stop_host_result = KioskHostService::stop_kiosk_host_silently(
            app_handle.clone(),
            db_connection,
            host_state,
            normalized_nickname.clone(),
        );
        if let Err(error) = &stop_host_result {
            Self::emit_log(
                &app_handle,
                &normalized_nickname,
                &format!("Failed to stop kiosk host before untorque: {}", error),
            );
        }

        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        let runtime = resolve_uv_runtime(&app_handle)?;
        let command_parts = Self::build_command_args(&normalized_nickname);
        let command_display = format_command_for_display(&command_parts);
        Self::emit_log(
            &app_handle,
            &normalized_nickname,
            &format!("Running untorque utility: {}", command_display),
        );

        let nickname_for_task = normalized_nickname.clone();
        let app_handle_for_task = app_handle.clone();
        let executable = runtime.executable;
        let working_dir = runtime.working_dir;
        let envs = runtime.envs;

        tauri::async_runtime::spawn_blocking(move || {
            Self::run_command(
                &app_handle_for_task,
                &nickname_for_task,
                &executable,
                &working_dir,
                &envs,
                &command_parts,
            )
        })
        .await
        .map_err(|error| format!("Untorque task failed: {}", error))?
    }

    fn run_command(
        app_handle: &AppHandle,
        nickname: &str,
        executable: &str,
        working_dir: &str,
        envs: &HashMap<String, String>,
        command_parts: &[String],
    ) -> Result<String, String> {
        let output = Command::new(executable)
            .args(command_parts)
            .current_dir(working_dir)
            .envs(envs)
            .output()
            .map_err(|error| format!("Failed to launch untorque utility: {}", error))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if !stdout.is_empty() {
            Self::emit_log(app_handle, nickname, &stdout);
        }
        if !stderr.is_empty() {
            Self::emit_log(app_handle, nickname, &stderr);
        }

        if !output.status.success() {
            let message = if stderr.is_empty() {
                format!(
                    "Untorque utility exited with status {}.",
                    output.status
                )
            } else {
                format!("Untorque utility failed: {}", stderr)
            };
            Self::emit_log(app_handle, nickname, &message);
            return Err(message);
        }

        let message = if stdout.is_empty() {
            "Untorqued both arms.".to_string()
        } else {
            stdout
        };
        Self::emit_log(app_handle, nickname, &message);
        Ok(message)
    }

    fn build_command_args(nickname: &str) -> Vec<String> {
        vec![
            "run".to_string(),
            "-m".to_string(),
            "lerobot.robots.sourccey.sourccey.sourccey.modules.torque.untorque".to_string(),
            format!("--id={}", nickname),
        ]
    }

    fn normalize_nickname(value: &str) -> Result<String, String> {
        let normalized = value.trim().trim_start_matches('@').trim();
        if normalized.is_empty() {
            return Err("Nickname cannot be empty".to_string());
        }
        if normalized.contains('/')
            || normalized.contains('\\')
            || normalized.contains('\n')
            || normalized.contains('\r')
            || normalized.contains('\0')
        {
            return Err("Nickname contains invalid characters".to_string());
        }
        Ok(normalized.to_string())
    }

    fn emit_log(app_handle: &AppHandle, nickname: &str, message: &str) {
        let formatted = format!("[{}] {}", nickname, message);
        let _ = app_handle.emit("kiosk-host-log", formatted.clone());
        write_process_log("kiosk-torque", &formatted);
    }
}

#[cfg(test)]
mod tests {
    use super::KioskTorqueService;

    #[test]
    fn normalize_nickname_trims_and_strips_at_prefix() {
        let normalized =
            KioskTorqueService::normalize_nickname("  @sourccey  ").expect("nickname should normalize");
        assert_eq!(normalized, "sourccey");
    }

    #[test]
    fn normalize_nickname_rejects_invalid_values() {
        assert!(KioskTorqueService::normalize_nickname(" ").is_err());
        assert!(KioskTorqueService::normalize_nickname("bad/name").is_err());
        assert!(KioskTorqueService::normalize_nickname("bad\\name").is_err());
    }

    #[test]
    fn build_command_args_runs_torque_module_for_robot_id() {
        let args = KioskTorqueService::build_command_args("robot-1");
        assert_eq!(args[0], "run");
        assert_eq!(args[1], "-m");
        assert_eq!(
            args[2],
            "lerobot.robots.sourccey.sourccey.sourccey.modules.torque.untorque"
        );
        assert!(args.iter().any(|arg| arg == "--id=robot-1"));
    }
}
