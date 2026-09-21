use super::{CalibrationService, DesktopSerialPortInfo};
use std::path::Path;
use std::process::Output;

#[cfg(unix)]
fn exit_status(code: i32) -> std::process::ExitStatus {
    use std::os::unix::process::ExitStatusExt;
    std::process::ExitStatus::from_raw(code)
}

#[cfg(windows)]
fn exit_status(code: u32) -> std::process::ExitStatus {
    use std::os::windows::process::ExitStatusExt;
    std::process::ExitStatus::from_raw(code)
}

fn make_output(success: bool, stdout: &str, stderr: &str) -> Output {
    Output {
        status: if success {
            exit_status(0)
        } else {
            exit_status(1)
        },
        stdout: stdout.as_bytes().to_vec(),
        stderr: stderr.as_bytes().to_vec(),
    }
}

#[test]
fn validate_calibration_output_accepts_clean_success() {
    let output = make_output(true, "calibration complete", "");
    let result = CalibrationService::validate_calibration_command_output(&output);
    assert!(result.is_ok());
}

#[test]
fn validate_calibration_output_rejects_noop_warning() {
    let output = make_output(
        true,
        "",
        "WARNING: Device does not support auto-calibration. Returning",
    );
    let result = CalibrationService::validate_calibration_command_output(&output);
    assert!(result.is_err());
    let error = result.err().unwrap_or_default();
    assert!(error.contains("does not support auto-calibration"));
}

#[test]
fn validate_calibration_output_reports_script_failure_details() {
    let output = make_output(false, "", "port is busy");
    let result = CalibrationService::validate_calibration_command_output(&output);
    assert!(result.is_err());
    let error = result.err().unwrap_or_default();
    assert!(error.contains("Calibration command failed: port is busy"));
}

#[test]
fn validate_calibration_output_rejects_python_thread_traceback() {
    let output = make_output(
        true,
        "",
        "Exception in thread Thread-1:\nTraceback (most recent call last):\nRuntimeError: left arm failed",
    );
    let result = CalibrationService::validate_calibration_command_output(&output);
    assert!(result.is_err());
    let error = result.err().unwrap_or_default();
    assert!(error.contains("RuntimeError: left arm failed"));
}

#[test]
fn format_process_output_log_lines_splits_multiline_tracebacks() {
    let lines = CalibrationService::format_process_output_log_lines(
        "Desktop teleoperator auto calibrate",
        "stderr",
        "Traceback (most recent call last):\nValueError: broken calibration\n",
    );

    assert_eq!(
        lines,
        vec![
            "Desktop teleoperator auto calibrate stderr: Traceback (most recent call last):"
                .to_string(),
            "Desktop teleoperator auto calibrate stderr | ValueError: broken calibration"
                .to_string(),
        ]
    );
}

#[test]
fn remote_auto_calibrate_uses_packaged_command() {
    assert_eq!(
        CalibrationService::remote_calibration_command_args("@robot-1", false),
        vec![
            "run".to_string(),
            "--no-sync".to_string(),
            "sourccey-calibrate".to_string(),
            "--id=robot-1".to_string(),
        ]
    );
}

#[test]
fn remote_full_calibrate_adds_full_reset_flag() {
    assert_eq!(
        CalibrationService::remote_calibration_command_args("sourccey", true),
        vec![
            "run".to_string(),
            "--no-sync".to_string(),
            "sourccey-calibrate".to_string(),
            "--id=sourccey".to_string(),
            "--full-reset".to_string(),
            "--yes".to_string(),
        ]
    );
}

#[test]
fn desktop_teleop_calibration_uses_packaged_command() {
    let args = CalibrationService::desktop_teleop_calibration_command_args("COM3", "COM8");
    assert_eq!(
        args,
        vec![
            "run".to_string(),
            "--no-sync".to_string(),
            "sourccey-teleop-calibrate".to_string(),
            "--left-arm-port=COM3".to_string(),
            "--right-arm-port=COM8".to_string(),
        ]
    );
}

#[test]
fn desktop_serial_port_discovery_uses_the_lerobot_runtime() {
    let args = CalibrationService::desktop_list_serial_ports_command_args();
    assert_eq!(&args[..4], ["run", "--no-sync", "python", "-c"]);
    assert!(args[4].contains("list_ports.comports()"));
    assert!(args[4].contains("FeetechMotorsBus"));
    assert!(args[4].contains("broadcast_ping"));
    assert!(args[4].contains("set(range(1, 7))"));
    assert!(args[4].contains("set(range(7, 13))"));
    assert!(args[4].contains("/dev/robotLeftArm"));
    assert!(args[4].contains("/dev/robotRightArm"));
}

#[test]
fn desktop_serial_port_discovery_parses_motor_id_metadata() {
    let ports: Vec<DesktopSerialPortInfo> = serde_json::from_str(
        r#"[{"port":"COM9","motorIds":[1,2,3,4,5,6],"suggestedArm":"left","isComplete":true,"probeError":null}]"#,
    )
    .expect("serial port metadata should deserialize");

    assert_eq!(ports[0].port, "COM9");
    assert_eq!(ports[0].motor_ids, vec![1, 2, 3, 4, 5, 6]);
    assert_eq!(ports[0].suggested_arm.as_deref(), Some("left"));
    assert!(ports[0].is_complete);
    assert!(ports[0].probe_error.is_none());
}

#[test]
fn desktop_teleop_status_uses_per_arm_calibration_files() {
    let (left, right) = CalibrationService::desktop_teleop_calibration_paths()
        .expect("desktop teleop calibration paths should resolve");

    assert!(left.ends_with(
        Path::new("calibration")
            .join("teleoperators")
            .join("sourccey_leader")
            .join("sourccey_left.json")
    ));
    assert!(right.ends_with(
        Path::new("calibration")
            .join("teleoperators")
            .join("sourccey_leader")
            .join("sourccey_right.json")
    ));
}
