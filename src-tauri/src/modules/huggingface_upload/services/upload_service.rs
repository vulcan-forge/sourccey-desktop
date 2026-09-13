use crate::modules::huggingface_upload::types::{DiscoveryReport, JobsReport};
use crate::services::directory::directory_service::DirectoryService;
use crate::utils::windows_process::configure_std_command;
use serde::de::DeserializeOwned;
use std::ffi::OsString;
use std::path::Path;
use std::process::Command;

const PROTOCOL_VERSION: u32 = 1;
const STDERR_LIMIT: usize = 4096;

pub struct UploadService;

impl UploadService {
    pub fn discover_datasets() -> Result<DiscoveryReport, String> {
        let report: DiscoveryReport = Self::run(&[OsString::from("discover")])?;
        Self::require_protocol(report.protocol_version)?;
        Ok(report)
    }

    pub fn list_jobs(database_path: &Path) -> Result<JobsReport, String> {
        let report: JobsReport = Self::run(&[
            OsString::from("jobs"),
            OsString::from("--database"),
            database_path.as_os_str().to_owned(),
        ])?;
        Self::require_protocol(report.protocol_version)?;
        Ok(report)
    }

    fn run<T: DeserializeOwned>(arguments: &[OsString]) -> Result<T, String> {
        let module_dir = DirectoryService::get_huggingface_upload_dir()?;
        let module_src = module_dir.join("src");
        if !module_src.join("vulcan_hf_upload").is_dir() {
            return Err(format!(
                "Hugging Face upload module is unavailable at {}",
                module_dir.display()
            ));
        }

        let python_path = DirectoryService::get_python_path()?;
        if !python_path.is_file() {
            return Err(format!(
                "Sourccey Python environment is unavailable at {}",
                python_path.display()
            ));
        }

        let mut command = Command::new(&python_path);
        command
            .arg("-m")
            .arg("vulcan_hf_upload")
            .args(arguments)
            .current_dir(&module_dir)
            .env("PYTHONPATH", module_src);
        configure_std_command(&mut command);

        let output = command
            .output()
            .map_err(|error| format!("Failed to start upload module: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let diagnostic: String = stderr.trim().chars().take(STDERR_LIMIT).collect();
            return Err(if diagnostic.is_empty() {
                format!("Upload module exited with status {}", output.status)
            } else {
                format!("Upload module failed: {diagnostic}")
            });
        }

        serde_json::from_slice(&output.stdout)
            .map_err(|error| format!("Upload module returned invalid JSON: {error}"))
    }

    fn require_protocol(actual: u32) -> Result<(), String> {
        if actual == PROTOCOL_VERSION {
            Ok(())
        } else {
            Err(format!(
                "Unsupported upload protocol version {actual}; expected {PROTOCOL_VERSION}"
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_discovery_protocol() {
        let report: DiscoveryReport = serde_json::from_str(
            r#"{"protocolVersion":1,"root":"/tmp/vulcan-studio","datasets":[],"skipped":[]}"#,
        )
        .unwrap();

        assert_eq!(report.protocol_version, 1);
        assert!(report.datasets.is_empty());
    }

    #[test]
    fn rejects_unknown_protocol_versions() {
        assert!(UploadService::require_protocol(2).is_err());
    }
}
