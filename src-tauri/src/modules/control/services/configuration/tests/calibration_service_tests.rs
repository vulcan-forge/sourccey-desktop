use super::CalibrationService;
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
        status: if success { exit_status(0) } else { exit_status(1) },
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
    assert!(error.contains("Python script failed: port is busy"));
}

