use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sourccey_sync_core::{repo_id_for_dataset, sha256_json, validate_dataset_name};
use std::fs;
use std::path::{Path, PathBuf};

const MAX_INFO_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone)]
pub struct DiscoveredDataset {
    pub dataset_name: String,
    pub repo_id: String,
    pub metadata: Value,
    pub metadata_sha256: String,
    pub total_episodes: u64,
    pub total_frames: u64,
    pub codebase_version: String,
    pub observed_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogReport {
    pub root: PathBuf,
    pub root_available: bool,
    pub discovered: usize,
    pub skipped: Vec<SkippedDataset>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedDataset {
    pub name: String,
    pub reason: String,
}

pub struct CatalogDiscovery {
    pub report: CatalogReport,
    pub datasets: Vec<DiscoveredDataset>,
}

pub fn discover(dataset_root: &Path) -> Result<CatalogDiscovery, String> {
    if !dataset_root.exists() {
        return Ok(CatalogDiscovery {
            report: CatalogReport {
                root: dataset_root.to_path_buf(),
                root_available: false,
                discovered: 0,
                skipped: Vec::new(),
            },
            datasets: Vec::new(),
        });
    }

    let root_metadata = fs::symlink_metadata(dataset_root)
        .map_err(|error| format!("failed to inspect dataset root: {error}"))?;
    if root_metadata.file_type().is_symlink() || !root_metadata.is_dir() {
        return Err("dataset root must be a real directory, not a symlink".to_string());
    }
    let canonical_root = fs::canonicalize(dataset_root)
        .map_err(|error| format!("failed to canonicalize dataset root: {error}"))?;
    let entries = fs::read_dir(&canonical_root)
        .map_err(|error| format!("failed to read dataset root: {error}"))?;
    let mut datasets = Vec::new();
    let mut skipped = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                skipped.push(SkippedDataset {
                    name: "<unreadable>".to_string(),
                    reason: error.to_string(),
                });
                continue;
            }
        };
        let dataset_name = match entry.file_name().into_string() {
            Ok(name) => name,
            Err(_) => {
                skipped.push(SkippedDataset {
                    name: "<non-utf8>".to_string(),
                    reason: "dataset directory name is not valid UTF-8".to_string(),
                });
                continue;
            }
        };
        if let Err(reason) = validate_dataset_name(&dataset_name) {
            skipped.push(SkippedDataset {
                name: dataset_name,
                reason,
            });
            continue;
        }

        match inspect_dataset(&canonical_root, &entry.path(), &dataset_name) {
            Ok(dataset) => datasets.push(dataset),
            Err(reason) => skipped.push(SkippedDataset {
                name: dataset_name,
                reason,
            }),
        }
    }

    datasets.sort_by(|left, right| left.dataset_name.cmp(&right.dataset_name));
    let discovered = datasets.len();
    Ok(CatalogDiscovery {
        report: CatalogReport {
            root: canonical_root,
            root_available: true,
            discovered,
            skipped,
        },
        datasets,
    })
}

fn inspect_dataset(
    canonical_root: &Path,
    candidate: &Path,
    dataset_name: &str,
) -> Result<DiscoveredDataset, String> {
    let candidate_metadata = fs::symlink_metadata(candidate)
        .map_err(|error| format!("failed to inspect dataset directory: {error}"))?;
    if candidate_metadata.file_type().is_symlink() || !candidate_metadata.is_dir() {
        return Err("dataset entry is not a regular directory".to_string());
    }
    let canonical_path = fs::canonicalize(candidate)
        .map_err(|error| format!("failed to canonicalize dataset directory: {error}"))?;
    if canonical_path.parent() != Some(canonical_root) {
        return Err("dataset is not a direct child of the approved root".to_string());
    }

    let info_path = canonical_path.join("meta").join("info.json");
    let info_metadata =
        fs::symlink_metadata(&info_path).map_err(|_| "meta/info.json is missing".to_string())?;
    if info_metadata.file_type().is_symlink()
        || !info_metadata.is_file()
        || info_metadata.len() > MAX_INFO_BYTES
    {
        return Err("meta/info.json must be a regular file no larger than 1 MiB".to_string());
    }
    let canonical_info = fs::canonicalize(&info_path)
        .map_err(|error| format!("failed to canonicalize meta/info.json: {error}"))?;
    if !canonical_info.starts_with(&canonical_path) {
        return Err("meta/info.json escapes the dataset directory".to_string());
    }

    let bytes = fs::read(&canonical_info)
        .map_err(|error| format!("failed to read meta/info.json: {error}"))?;
    let metadata: Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("meta/info.json contains invalid JSON: {error}"))?;
    let total_episodes = required_u64(&metadata, "total_episodes")?;
    let total_frames = required_u64(&metadata, "total_frames")?;
    let codebase_version = metadata
        .get("codebase_version")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "meta/info.json is missing codebase_version".to_string())?
        .to_string();
    let metadata_sha256 = sha256_json(&metadata)?;
    let observed_at = info_metadata
        .modified()
        .ok()
        .map(DateTime::<Utc>::from)
        .unwrap_or_else(Utc::now);

    Ok(DiscoveredDataset {
        dataset_name: dataset_name.to_string(),
        repo_id: repo_id_for_dataset(dataset_name),
        metadata,
        metadata_sha256,
        total_episodes,
        total_frames,
        codebase_version,
        observed_at,
    })
}

fn required_u64(metadata: &Value, field: &str) -> Result<u64, String> {
    metadata
        .get(field)
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("meta/info.json is missing {field}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_only_valid_direct_vulcan_studio_children() {
        let test_root =
            std::env::temp_dir().join(format!("sourccey-sync-catalog-{}", uuid::Uuid::now_v7()));
        let approved_root = test_root.join("vulcan-studio");
        let metadata_dir = approved_root.join("fold-shirts").join("meta");
        fs::create_dir_all(&metadata_dir).unwrap();
        fs::create_dir_all(approved_root.join("not-a-dataset")).unwrap();
        fs::write(
            metadata_dir.join("info.json"),
            r#"{"codebase_version":"3.0","total_episodes":4,"total_frames":120}"#,
        )
        .unwrap();

        let discovery = discover(&approved_root).unwrap();
        assert_eq!(discovery.datasets.len(), 1);
        assert_eq!(discovery.datasets[0].repo_id, "vulcan-studio/fold-shirts");
        assert_eq!(discovery.datasets[0].total_episodes, 4);
        assert_eq!(discovery.report.skipped.len(), 1);

        fs::remove_dir_all(test_root).unwrap();
    }
}
