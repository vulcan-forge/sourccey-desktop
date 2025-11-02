use crate::services::directory::directory_service::DirectoryService;
use arrow::array::{Array, BooleanArray, Float64Array, Int64Array, StringArray};
use arrow::datatypes::DataType;
use chrono;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

// Import our types
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::ActionStats;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::CameraMetadata;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::CameraStats;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::DatasetMetadata;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::EpisodeIndexStats;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::EpisodeMetadata;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::FrameIndexStats;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::IndexStats;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::ObservationStateStats;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::Stats;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::StatsExtractor;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::TaskIndexStats;
use crate::modules::ai::types::dataset::v3::dataset_metadata_types::TimestampStats;

pub struct DatasetMetadataService;

impl DatasetMetadataService {
    //--------------------------------------------------
    // Metadata Functions
    //--------------------------------------------------
    pub fn get_dataset_metadata(
        nickname: &String,
        dataset: &String,
    ) -> Result<DatasetMetadata, String> {
        let dataset_path = DirectoryService::get_lerobot_dataset_path(nickname, dataset)?;
        let info_path = dataset_path.join("meta").join("info.json");
        let info_content = fs::read_to_string(&info_path)
            .map_err(|e| format!("Failed to read info.json at {:?}: {}", info_path, e))?;
        let info: DatasetMetadata = serde_json::from_str(&info_content)
            .map_err(|e| format!("Failed to parse info.json at {:?}: {}", info_path, e))?;
        Ok(info)
    }

    pub fn get_episode_metadata(
        nickname: &String,
        dataset: &String,
        episode_index: usize,
    ) -> Result<EpisodeMetadata, String> {
        let (chunk_name, file_name, row_idx) =
            Self::get_episode_location(nickname, dataset, episode_index)?;
        Self::get_episode_metadata_from_data(nickname, dataset, &chunk_name, &file_name, row_idx)
    }

    pub fn get_episode_metadata_from_data(
        nickname: &String,
        dataset: &String,
        chunk_name: &str,
        file_name: &str,
        row_idx: usize,
    ) -> Result<EpisodeMetadata, String> {
        let dataset_path = DirectoryService::get_lerobot_dataset_path(nickname, dataset)?;
        // Extract the episode directly from the file at the specific row
        let file_path = dataset_path
            .join("meta")
            .join("episodes")
            .join(chunk_name)
            .join(format!("{}.parquet", file_name));
        let file_size = Self::get_file_size(&file_path)?;
        Self::extract_episode_from_file(&file_path, row_idx, file_size)
    }

    //--------------------------------------------------
    // File Helper Functions
    //--------------------------------------------------
    pub fn get_chunk_id_from_chunk_name(chunk_name: &str) -> Result<usize, String> {
        let chunk_id = chunk_name
            .strip_prefix("chunk-")
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(0); // fallback to 0 if parsing fails
        Ok(chunk_id)
    }

    pub fn get_file_id_from_file_name(file_name: &str) -> Result<usize, String> {
        let file_id = file_name
            .strip_prefix("file-")
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(0); // fallback to 0 if parsing fails
        Ok(file_id)
    }

    //--------------------------------------------------
    // Episode Location Functions
    //--------------------------------------------------
    pub fn get_episode_location(
        nickname: &String,
        dataset: &String,
        episode_index: usize,
    ) -> Result<(String, String, usize), String> {
        let dataset_path = DirectoryService::get_lerobot_dataset_path(nickname, dataset)?;
        let meta_path = dataset_path.join("meta").join("episodes");

        if !meta_path.exists() {
            return Err(format!(
                "Meta episodes directory not found: {:?}",
                meta_path
            ));
        }

        // Search through all chunks starting from chunk-000
        let chunk_entries = fs::read_dir(&meta_path).map_err(|e| {
            format!(
                "Failed to read meta episodes directory {:?}: {}",
                meta_path, e
            )
        })?;

        let mut chunk_dirs: Vec<_> = chunk_entries
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().is_dir())
            .collect();

        // Sort chunks to ensure we start from chunk-000
        chunk_dirs.sort_by_key(|entry| entry.file_name());

        for chunk_entry in chunk_dirs {
            let chunk_path = chunk_entry.path();
            let chunk_name = chunk_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            // Search through all files in this chunk starting from file-000
            let file_entries = fs::read_dir(&chunk_path)
                .map_err(|e| format!("Failed to read chunk directory {:?}: {}", chunk_path, e))?;

            let mut file_dirs: Vec<_> = file_entries
                .filter_map(|entry| entry.ok())
                .filter(|entry| entry.path().is_file())
                .collect();

            // Sort files to ensure we start from file-000
            file_dirs.sort_by_key(|entry| entry.file_name());

            for file_entry in file_dirs {
                let file_path = file_entry.path();

                // Only process parquet files
                if file_path.extension().map_or(false, |ext| ext == "parquet") {
                    let file_name = file_path
                        .file_stem()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string();

                    match Self::search_episode_in_file(&file_path, episode_index) {
                        Ok(Some(row_idx)) => {
                            return Ok((chunk_name, file_name, row_idx));
                        }
                        Ok(None) => {
                            // Episode not in this file, continue searching
                            continue;
                        }
                        Err(_) => {
                            // Continue searching other files even if one fails
                            continue;
                        }
                    }
                }
            }
        }

        Err(format!(
            "Episode {} not found in any metadata files",
            episode_index
        ))
    }

    /// Search for a specific episode in a parquet file - returns Some(row_idx) if found, None if not
    fn search_episode_in_file(
        file_path: &PathBuf,
        target_episode_index: usize,
    ) -> Result<Option<usize>, String> {
        // Read the parquet file
        let file = std::fs::File::open(file_path)
            .map_err(|e| format!("Failed to open metadata file {:?}: {}", file_path, e))?;

        let builder = ParquetRecordBatchReaderBuilder::try_new(file)
            .map_err(|e| format!("Failed to create ParquetRecordBatchReader: {}", e))?;

        let schema = builder.schema();
        let columns: Vec<String> = schema.fields().iter().map(|f| f.name().clone()).collect();

        let mut reader = builder
            .build()
            .map_err(|e| format!("Failed to build ParquetRecordBatchReader: {}", e))?;

        // Read all batches and search for the episode
        let mut global_row_idx = 0;
        while let Some(batch) = reader
            .next()
            .transpose()
            .map_err(|e| format!("Error reading batch: {}", e))?
        {
            // Check if this batch contains our target episode
            if let Some(local_row_idx) =
                Self::batch_contains_episode(&batch, &columns, target_episode_index)?
            {
                return Ok(Some(global_row_idx + local_row_idx));
            }

            global_row_idx += batch.num_rows();
        }

        Ok(None)
    }

    /// Check if a batch contains the target episode index - returns Some(local_row_idx) if found
    fn batch_contains_episode(
        batch: &arrow::record_batch::RecordBatch,
        columns: &[String],
        target_episode_index: usize,
    ) -> Result<Option<usize>, String> {
        // Find the episode_index column
        let episode_index_idx = Self::find_column_index(columns, "episode_index")?;

        // Check if any row in this batch has our target episode index
        let episode_index_col = batch.column(episode_index_idx);

        for row_idx in 0..batch.num_rows() {
            let episode_index = Self::get_value_as_usize(episode_index_col.as_ref(), row_idx)?;

            if episode_index == target_episode_index {
                return Ok(Some(row_idx));
            }
        }

        Ok(None)
    }

    //--------------------------------------------------
    // Data Extraction Functions
    //--------------------------------------------------

    /// Extract episode data from a parquet file at a specific row
    fn extract_episode_from_file(
        file_path: &PathBuf,
        target_row_idx: usize,
        file_size: usize,
    ) -> Result<EpisodeMetadata, String> {
        // Read the parquet file
        let file = std::fs::File::open(file_path)
            .map_err(|e| format!("Failed to open metadata file {:?}: {}", file_path, e))?;

        let builder = ParquetRecordBatchReaderBuilder::try_new(file)
            .map_err(|e| format!("Failed to create ParquetRecordBatchReader: {}", e))?;

        let schema = builder.schema();
        let columns: Vec<String> = schema.fields().iter().map(|f| f.name().clone()).collect();

        let mut reader = builder
            .build()
            .map_err(|e| format!("Failed to build ParquetRecordBatchReader: {}", e))?;

        // Read batches until we reach the target row
        let mut current_row = 0;
        while let Some(batch) = reader
            .next()
            .transpose()
            .map_err(|e| format!("Error reading batch: {}", e))?
        {
            let batch_size = batch.num_rows();

            // Check if our target row is in this batch
            if current_row + batch_size > target_row_idx {
                let local_row_idx = target_row_idx - current_row;
                return Self::extract_episode_from_batch(
                    &batch,
                    &columns,
                    file_size,
                    local_row_idx,
                );
            }

            current_row += batch_size;
        }

        Err(format!(
            "Row {} not found in file {:?}",
            target_row_idx, file_path
        ))
    }

    /// Extract episode data from a batch at a specific row
    fn extract_episode_from_batch(
        batch: &arrow::record_batch::RecordBatch,
        columns: &[String],
        file_size: usize,
        row_idx: usize,
    ) -> Result<EpisodeMetadata, String> {
        // Find column indices
        let episode_index_idx = Self::find_column_index(columns, "episode_index")?;
        let tasks_idx = Self::find_column_index(columns, "tasks")?;
        let length_idx = Self::find_column_index(columns, "length")?;
        let data_chunk_idx = Self::find_column_index(columns, "data/chunk_index")?;
        let data_file_idx = Self::find_column_index(columns, "data/file_index")?;
        let dataset_from_idx = Self::find_column_index(columns, "dataset_from_index")?;
        let dataset_to_idx = Self::find_column_index(columns, "dataset_to_index")?;

        // Extract basic episode data from the specific row
        let episode_index = Self::get_value_as_usize(batch.column(episode_index_idx), row_idx)?;
        let tasks = Self::get_value_as_string_array(batch.column(tasks_idx), row_idx)?;
        let length = Self::get_value_as_usize(batch.column(length_idx), row_idx)?;
        let data_chunk_index = Self::get_value_as_usize(batch.column(data_chunk_idx), row_idx)?;
        let data_file_index = Self::get_value_as_usize(batch.column(data_file_idx), row_idx)?;
        let dataset_from_index = Self::get_value_as_usize(batch.column(dataset_from_idx), row_idx)?;
        let dataset_to_index = Self::get_value_as_usize(batch.column(dataset_to_idx), row_idx)?;

        // Extract camera metadata
        let mut camera_metadata = Vec::new();
        for col in columns {
            if col.starts_with("videos/") && col.ends_with("/chunk_index") {
                let camera_name = col
                    .strip_prefix("videos/")
                    .unwrap()
                    .strip_suffix("/chunk_index")
                    .unwrap()
                    .to_string();

                if let Ok(chunk_idx) =
                    Self::find_column_index(columns, &format!("videos/{}/chunk_index", camera_name))
                {
                    if let Ok(file_idx) = Self::find_column_index(
                        columns,
                        &format!("videos/{}/file_index", camera_name),
                    ) {
                        let chunk_index =
                            Self::get_value_as_usize(batch.column(chunk_idx), row_idx).unwrap_or(0);
                        let file_index =
                            Self::get_value_as_usize(batch.column(file_idx), row_idx).unwrap_or(0);

                        let from_timestamp = Self::find_column_index(
                            columns,
                            &format!("videos/{}/from_timestamp", camera_name),
                        )
                        .ok()
                        .and_then(|idx| Self::get_value_as_f64(batch.column(idx), row_idx).ok());

                        let to_timestamp = Self::find_column_index(
                            columns,
                            &format!("videos/{}/to_timestamp", camera_name),
                        )
                        .ok()
                        .and_then(|idx| Self::get_value_as_f64(batch.column(idx), row_idx).ok());

                        camera_metadata.push(CameraMetadata {
                            camera_name,
                            chunk_index,
                            file_index,
                            from_timestamp,
                            to_timestamp,
                        });
                    }
                }
            }
        }

        // Extract all statistics
        let action_stats = Self::extract_action_stats_at_row(batch, columns, row_idx)?;
        let observation_state_stats =
            Self::extract_observation_state_stats_at_row(batch, columns, row_idx)?;
        let camera_stats = Self::extract_camera_stats_at_row(batch, columns, row_idx)?;
        let timestamp_stats = Self::extract_timestamp_stats_at_row(batch, columns, row_idx)?;
        let frame_index_stats = Self::extract_frame_index_stats_at_row(batch, columns, row_idx)?;
        let episode_index_stats =
            Self::extract_episode_index_stats_at_row(batch, columns, row_idx)?;
        let index_stats = Self::extract_index_stats_at_row(batch, columns, row_idx)?;
        let task_index_stats = Self::extract_task_index_stats_at_row(batch, columns, row_idx)?;

        // Extract meta episodes indices
        let meta_episodes_chunk_index =
            Self::find_column_index(columns, "meta/episodes/chunk_index")
                .ok()
                .and_then(|idx| Self::get_value_as_usize(batch.column(idx), row_idx).ok());
        let meta_episodes_file_index = Self::find_column_index(columns, "meta/episodes/file_index")
            .ok()
            .and_then(|idx| Self::get_value_as_usize(batch.column(idx), row_idx).ok());

        Ok(EpisodeMetadata {
            episode_index,
            tasks,
            length,
            data_chunk_index,
            data_file_index,
            dataset_from_index,
            dataset_to_index,
            cameras: camera_metadata,
            action_stats,
            observation_state_stats,
            camera_stats,
            timestamp_stats,
            frame_index_stats,
            episode_index_stats,
            index_stats,
            task_index_stats,
            meta_episodes_chunk_index,
            meta_episodes_file_index,
            file_size: file_size / batch.num_rows(), // Distribute file size across episodes
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    /// Find the index of a column by name
    fn find_column_index(columns: &[String], column_name: &str) -> Result<usize, String> {
        columns
            .iter()
            .position(|col| col == column_name)
            .ok_or_else(|| format!("Column '{}' not found", column_name))
    }

    /// Get value as usize from array
    fn get_value_as_usize(array: &dyn Array, row: usize) -> Result<usize, String> {
        if array.is_null(row) {
            return Ok(0);
        }
        match array.data_type() {
            DataType::Int64 => {
                let arr = array
                    .as_any()
                    .downcast_ref::<Int64Array>()
                    .ok_or_else(|| "Failed to cast to Int64Array")?;
                Ok(arr.value(row) as usize)
            }
            DataType::UInt64 => {
                let arr = array
                    .as_any()
                    .downcast_ref::<arrow::array::UInt64Array>()
                    .ok_or_else(|| "Failed to cast to UInt64Array")?;
                Ok(arr.value(row) as usize)
            }
            DataType::Int32 => {
                let arr = array
                    .as_any()
                    .downcast_ref::<arrow::array::Int32Array>()
                    .ok_or_else(|| "Failed to cast to Int32Array")?;
                Ok(arr.value(row) as usize)
            }
            DataType::UInt32 => {
                let arr = array
                    .as_any()
                    .downcast_ref::<arrow::array::UInt32Array>()
                    .ok_or_else(|| "Failed to cast to UInt32Array")?;
                Ok(arr.value(row) as usize)
            }
            _ => Err(format!(
                "Unsupported data type for usize: {:?}",
                array.data_type()
            )),
        }
    }

    /// Get value as f64 from array
    fn get_value_as_f64(array: &dyn Array, row: usize) -> Result<f64, String> {
        if array.is_null(row) {
            return Ok(0.0);
        }

        match array.data_type() {
            DataType::Float64 => {
                let arr = array
                    .as_any()
                    .downcast_ref::<Float64Array>()
                    .ok_or_else(|| "Failed to cast to Float64Array")?;
                let value = arr.value(row);
                Ok(value)
            }
            DataType::Float32 => {
                let arr = array
                    .as_any()
                    .downcast_ref::<arrow::array::Float32Array>()
                    .ok_or_else(|| "Failed to cast to Float32Array")?;
                let value = arr.value(row) as f64;
                Ok(value)
            }
            DataType::Int64 => {
                let arr = array
                    .as_any()
                    .downcast_ref::<Int64Array>()
                    .ok_or_else(|| "Failed to cast to Int64Array")?;
                let value = arr.value(row) as f64;
                Ok(value)
            }
            DataType::Int32 => {
                let arr = array
                    .as_any()
                    .downcast_ref::<arrow::array::Int32Array>()
                    .ok_or_else(|| "Failed to cast to Int32Array")?;
                let value = arr.value(row) as f64;
                Ok(value)
            }
            DataType::List(_) => {
                let arr = array
                    .as_any()
                    .downcast_ref::<arrow::array::ListArray>()
                    .ok_or_else(|| "Failed to cast to ListArray")?;

                let values = arr.value(row);

                // Handle different element types in the list
                match values.data_type() {
                    DataType::Float64 => {
                        let float_array = values
                            .as_any()
                            .downcast_ref::<Float64Array>()
                            .ok_or_else(|| "Failed to cast list values to Float64Array")?;
                        if float_array.len() > 0 && !float_array.is_null(0) {
                            Ok(float_array.value(0))
                        } else {
                            Ok(0.0)
                        }
                    }
                    DataType::Int64 => {
                        let int_array = values
                            .as_any()
                            .downcast_ref::<Int64Array>()
                            .ok_or_else(|| "Failed to cast list values to Int64Array")?;
                        if int_array.len() > 0 && !int_array.is_null(0) {
                            Ok(int_array.value(0) as f64)
                        } else {
                            Ok(0.0)
                        }
                    }
                    DataType::List(_) => {
                        // Handle nested lists (like for camera stats)
                        let nested_list = values
                            .as_any()
                            .downcast_ref::<arrow::array::ListArray>()
                            .ok_or_else(|| "Failed to cast to nested ListArray")?;

                        if nested_list.len() > 0 {
                            let inner_values = nested_list.value(0);
                            match inner_values.data_type() {
                                DataType::List(_) => {
                                    // Triple nested list - get the first element of the first inner list
                                    let triple_list = inner_values
                                        .as_any()
                                        .downcast_ref::<arrow::array::ListArray>()
                                        .ok_or_else(|| "Failed to cast to triple ListArray")?;

                                    if triple_list.len() > 0 {
                                        let final_values = triple_list.value(0);
                                        let float_array = final_values
                                            .as_any()
                                            .downcast_ref::<Float64Array>()
                                            .ok_or_else(|| {
                                                "Failed to cast final values to Float64Array"
                                            })?;
                                        if float_array.len() > 0 && !float_array.is_null(0) {
                                            Ok(float_array.value(0))
                                        } else {
                                            Ok(0.0)
                                        }
                                    } else {
                                        Ok(0.0)
                                    }
                                }
                                _ => Ok(0.0),
                            }
                        } else {
                            Ok(0.0)
                        }
                    }
                    _ => Ok(0.0),
                }
            }
            _ => Err(format!(
                "Unsupported data type for f64: {:?}",
                array.data_type()
            )),
        }
    }

    /// Get value as string array from array
    fn get_value_as_string_array(array: &dyn Array, row: usize) -> Result<Vec<String>, String> {
        if array.is_null(row) {
            return Ok(vec![]);
        }
        match array.data_type() {
            DataType::Utf8 => {
                let arr = array
                    .as_any()
                    .downcast_ref::<StringArray>()
                    .ok_or_else(|| "Failed to cast to StringArray")?;
                let value = arr.value(row);
                // Parse the string array format like "['Wave your hand']"
                if value.starts_with('[') && value.ends_with(']') {
                    let inner = value.strip_prefix('[').unwrap().strip_suffix(']').unwrap();
                    let tasks: Vec<String> = inner
                        .split(',')
                        .map(|s| s.trim().trim_matches('\'').to_string())
                        .collect();
                    Ok(tasks)
                } else {
                    Ok(vec![value.to_string()])
                }
            }
            DataType::List(_) => {
                let arr = array
                    .as_any()
                    .downcast_ref::<arrow::array::ListArray>()
                    .ok_or_else(|| "Failed to cast to ListArray")?;

                let values = arr.value(row);
                let string_array = values
                    .as_any()
                    .downcast_ref::<StringArray>()
                    .ok_or_else(|| "Failed to cast list values to StringArray")?;

                let mut result = Vec::new();
                for i in 0..string_array.len() {
                    if !string_array.is_null(i) {
                        result.push(string_array.value(i).to_string());
                    }
                }
                Ok(result)
            }
            _ => Err(format!(
                "Unsupported data type for string array: {:?}",
                array.data_type()
            )),
        }
    }

    /// Get the size of a specific file
    pub fn get_file_size(path: &PathBuf) -> Result<usize, String> {
        let metadata = fs::metadata(path)
            .map_err(|e| format!("Failed to get metadata for {:?}: {}", path, e))?;
        Ok(metadata.len() as usize)
    }

    // Helper functions for extracting stats at a specific row
    fn extract_action_stats_at_row(
        batch: &arrow::record_batch::RecordBatch,
        columns: &[String],
        row_idx: usize,
    ) -> Result<Option<ActionStats>, String> {
        Self::extract_stats_for_prefix_at_row(batch, columns, "stats/action/", row_idx)
            .map(|stats| Some(ActionStats::from_stats(stats)))
    }

    fn extract_observation_state_stats_at_row(
        batch: &arrow::record_batch::RecordBatch,
        columns: &[String],
        row_idx: usize,
    ) -> Result<Option<ObservationStateStats>, String> {
        Self::extract_stats_for_prefix_at_row(batch, columns, "stats/observation.state/", row_idx)
            .map(|stats| Some(ObservationStateStats::from_stats(stats)))
    }

    fn extract_camera_stats_at_row(
        batch: &arrow::record_batch::RecordBatch,
        columns: &[String],
        row_idx: usize,
    ) -> Result<HashMap<String, CameraStats>, String> {
        // Extract all camera stats by finding unique camera prefixes
        let mut camera_stats = HashMap::new();

        for col in columns {
            if col.starts_with("stats/observation.images.") {
                let parts: Vec<&str> = col.split('/').collect();
                if parts.len() >= 3 {
                    let camera_name = parts[1].to_string();
                    if !camera_stats.contains_key(&camera_name) {
                        if let Ok(stats) = Self::extract_stats_for_prefix_at_row(
                            batch,
                            columns,
                            &format!("stats/observation.images.{}/", camera_name),
                            row_idx,
                        ) {
                            camera_stats.insert(camera_name, CameraStats::from_stats(stats));
                        }
                    }
                }
            }
        }

        Ok(camera_stats)
    }

    fn extract_timestamp_stats_at_row(
        batch: &arrow::record_batch::RecordBatch,
        columns: &[String],
        row_idx: usize,
    ) -> Result<Option<TimestampStats>, String> {
        Self::extract_stats_for_prefix_at_row(batch, columns, "stats/timestamp/", row_idx)
            .map(|stats| Some(TimestampStats::from_stats(stats)))
    }

    fn extract_frame_index_stats_at_row(
        batch: &arrow::record_batch::RecordBatch,
        columns: &[String],
        row_idx: usize,
    ) -> Result<Option<FrameIndexStats>, String> {
        Self::extract_stats_for_prefix_at_row(batch, columns, "stats/frame_index/", row_idx)
            .map(|stats| Some(FrameIndexStats::from_stats(stats)))
    }

    fn extract_episode_index_stats_at_row(
        batch: &arrow::record_batch::RecordBatch,
        columns: &[String],
        row_idx: usize,
    ) -> Result<Option<EpisodeIndexStats>, String> {
        Self::extract_stats_for_prefix_at_row(batch, columns, "stats/episode_index/", row_idx)
            .map(|stats| Some(EpisodeIndexStats::from_stats(stats)))
    }

    fn extract_index_stats_at_row(
        batch: &arrow::record_batch::RecordBatch,
        columns: &[String],
        row_idx: usize,
    ) -> Result<Option<IndexStats>, String> {
        Self::extract_stats_for_prefix_at_row(batch, columns, "stats/index/", row_idx)
            .map(|stats| Some(IndexStats::from_stats(stats)))
    }

    fn extract_task_index_stats_at_row(
        batch: &arrow::record_batch::RecordBatch,
        columns: &[String],
        row_idx: usize,
    ) -> Result<Option<TaskIndexStats>, String> {
        Self::extract_stats_for_prefix_at_row(batch, columns, "stats/task_index/", row_idx)
            .map(|stats| Some(TaskIndexStats::from_stats(stats)))
    }

    /// Generic function to extract statistics for a given prefix at a specific row
    fn extract_stats_for_prefix_at_row(
        batch: &arrow::record_batch::RecordBatch,
        columns: &[String],
        prefix: &str,
        row_idx: usize,
    ) -> Result<Stats, String> {
        let min_idx = Self::find_column_index(columns, &format!("{}min", prefix)).ok();
        let max_idx = Self::find_column_index(columns, &format!("{}max", prefix)).ok();
        let mean_idx = Self::find_column_index(columns, &format!("{}mean", prefix)).ok();
        let std_idx = Self::find_column_index(columns, &format!("{}std", prefix)).ok();
        let count_idx = Self::find_column_index(columns, &format!("{}count", prefix)).ok();

        let min = min_idx.and_then(|idx| Self::get_value_as_f64(batch.column(idx), row_idx).ok());
        let max = max_idx.and_then(|idx| Self::get_value_as_f64(batch.column(idx), row_idx).ok());
        let mean = mean_idx.and_then(|idx| Self::get_value_as_f64(batch.column(idx), row_idx).ok());
        let std = std_idx.and_then(|idx| Self::get_value_as_f64(batch.column(idx), row_idx).ok());
        let count =
            count_idx.and_then(|idx| Self::get_value_as_f64(batch.column(idx), row_idx).ok());

        Ok(Stats {
            min,
            max,
            mean,
            std,
            count,
        })
    }
}
