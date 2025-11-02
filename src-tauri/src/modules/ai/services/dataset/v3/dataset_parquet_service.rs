use crate::modules::ai::services::dataset::v3::dataset_metadata_service::DatasetMetadataService;
use crate::modules::ai::types::dataset::v3::dataset_parquet_types::{
    ColumnData, DatasetParquet, EpisodeParquet,
};
use crate::services::directory::directory_service::DirectoryService;
use arrow::array::{
    Array, BooleanArray, DictionaryArray, Float64Array, Int32Array, Int64Array, ListArray,
    StringArray,
};
use arrow::datatypes::{DataType, Int32Type};
use chrono;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub struct DatasetParquetService;

impl DatasetParquetService {
    /// Get the parquet data for a dataset
    pub fn get_dataset_parquet_data(
        nickname: &String,
        dataset: &String,
    ) -> Result<DatasetParquet, String> {
        let mut episodes = Vec::new();
        let mut total_rows = 0;
        let mut total_size = 0;
        let mut chunks = Vec::new();
        let mut column_schema = Vec::new();

        let dataset_path = DirectoryService::get_lerobot_dataset_path(nickname, dataset)?;

        // Find all chunk directories
        let chunk_dirs = fs::read_dir(dataset_path.join("data"))
            .map_err(|e| format!("Failed to read data directory: {}", e))?;

        for chunk_entry in chunk_dirs {
            let chunk_entry =
                chunk_entry.map_err(|e| format!("Failed to read chunk entry: {}", e))?;
            let chunk_path = chunk_entry.path();
            if chunk_path.is_dir() {
                let chunk_name = chunk_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                chunks.push(chunk_name.clone());

                // Find all .parquet files in this chunk
                let parquet_files = Self::find_parquet_files(&chunk_path)?;
                for parquet_file in parquet_files {
                    let file_name = parquet_file
                        .file_stem()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string();
                    let builder = Self::get_parquet_batch_builder(&parquet_file)?;
                    let (file_rows, file_size) = Self::process_parquet_file_data(builder)?;
                    total_rows += file_rows;
                    total_size += file_size;

                    let builder = Self::get_parquet_batch_builder(&parquet_file)?;
                    match Self::process_parquet_file_episodes(
                        builder,
                        &chunk_name,
                        &file_name,
                    ) {
                        Ok(file_episodes) => {
                            for episode in file_episodes {
                                if column_schema.is_empty() {
                                    column_schema = Self::extract_column_schema(&parquet_file)?;
                                }
                                episodes.push(episode);
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to process parquet file {:?}: {}", parquet_file, e);
                        }
                    }
                }
            }
        }

        Ok(DatasetParquet {
            dataset_name: dataset_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string(),
            total_episodes: episodes.len(),
            total_rows,
            total_size,
            chunks,
            episodes,
            column_schema,
        })
    }

    /// Get the parquet data for an episode
    pub fn get_episode_parquet(
        nickname: &String,
        dataset: &String,
        episode_id: usize,
    ) -> Result<EpisodeParquet, String> {
        let dataset_path = DirectoryService::get_lerobot_dataset_path(nickname, dataset)?;
        let (chunk_name, file_name, row_idx) =
            DatasetMetadataService::get_episode_location(nickname, dataset, episode_id)?;
        let episode_metadata = DatasetMetadataService::get_episode_metadata_from_data(
            nickname,
            dataset,
            &chunk_name,
            &file_name,
            row_idx,
        )?;

        // Get the file path
        let file_path = dataset_path
            .join("data")
            .join(chunk_name.clone())
            .join(format!("{}.parquet", file_name));

        // Extract the episode video segment using frame indices
        let start_frame = episode_metadata.dataset_from_index;
        let end_frame = episode_metadata.dataset_to_index;
        let parquet_segment = Self::extract_parquet_segment(&file_path, start_frame, end_frame)?;

        // Calculate the total duration
        let chunk_id = DatasetMetadataService::get_chunk_id_from_chunk_name(&chunk_name)?;
        let file_id = DatasetMetadataService::get_file_id_from_file_name(&file_name)?;

        let episode_parquet = EpisodeParquet {
            parquet: parquet_segment,
            chunk_id,
            file_id,
            episode_id,
            total_frames: Some(end_frame - start_frame),
            start_frame: Some(start_frame),
            end_frame: Some(end_frame),
        };

        Ok(episode_parquet)
    }

    /// Get the total size of all parquet data files in a dataset
    pub fn calculate_data_size(dataset_path: &Path) -> Result<usize, String> {
        let mut total_size = 0usize;

        let data_path = dataset_path.join("data");
        if !data_path.exists() || !data_path.is_dir() {
            return Ok(total_size);
        }

        // Walk through all chunk directories
        let chunk_entries = fs::read_dir(&data_path)
            .map_err(|e| format!("Failed to read data directory {:?}: {}", data_path, e))?;

        for chunk_entry in chunk_entries {
            let chunk_entry =
                chunk_entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let chunk_path = chunk_entry.path();

            if chunk_path.is_dir() {
                // This is a chunk directory (e.g., "chunk-000")
                let data_entries = fs::read_dir(&chunk_path).map_err(|e| {
                    format!("Failed to read chunk directory {:?}: {}", chunk_path, e)
                })?;

                for data_entry in data_entries {
                    let data_entry =
                        data_entry.map_err(|e| format!("Failed to read data entry: {}", e))?;
                    let data_file = data_entry.path();

                    // Only process parquet files
                    if data_file.is_file()
                        && data_file.extension().map_or(false, |ext| ext == "parquet")
                    {
                        let metadata = fs::metadata(&data_file).map_err(|e| {
                            format!("Failed to get metadata for {:?}: {}", data_file, e)
                        })?;
                        total_size += metadata.len() as usize;
                    }
                }
            }
        }

        Ok(total_size)
    }

    //--------------------------------------------------
    // Parquet File Helper Functions
    //--------------------------------------------------

    /// Find all parquet files in a directory
    fn find_parquet_files(dir_path: &Path) -> Result<Vec<PathBuf>, String> {
        let mut parquet_files = Vec::new();

        let entries = fs::read_dir(dir_path)
            .map_err(|e| format!("Failed to read directory {:?}: {}", dir_path, e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_file() {
                if let Some(extension) = path.extension() {
                    if extension == "parquet" {
                        parquet_files.push(path);
                    }
                }
            }
        }

        // Sort files for consistent ordering
        parquet_files.sort();
        Ok(parquet_files)
    }

    fn extract_parquet_segment(
        parquet_path: &PathBuf,
        start_frame: usize,
        end_frame: usize,
    ) -> Result<Vec<HashMap<String, serde_json::Value>>, String> {
        // Validate frame range
        if start_frame >= end_frame {
            return Ok(Vec::new());
        }

        // Get the parquet batch builder
        let builder = Self::get_parquet_batch_builder(parquet_path)?;
        let schema = builder.schema();
        let columns: Vec<String> = schema.fields().iter().map(|f| f.name().clone()).collect();

        // Build the reader
        let mut reader = builder
            .build()
            .map_err(|e| format!("Failed to build ParquetRecordBatchReader: {}", e))?;

        let mut segment_data = Vec::new();
        let mut current_row = 0;

        // Read batches and extract the segment
        while let Some(batch) = reader
            .next()
            .transpose()
            .map_err(|e| format!("Error reading batch: {}", e))?
        {
            let batch_rows = batch.num_rows();
            let batch_end_row = current_row + batch_rows;

            // Check if this batch contains any rows in our target range
            if batch_end_row > start_frame && current_row < end_frame {
                // Calculate the range of rows to extract from this batch
                let batch_start = std::cmp::max(start_frame, current_row) - current_row;
                let batch_end = std::cmp::min(end_frame, batch_end_row) - current_row;

                // Extract rows from the batch
                for row_idx in batch_start..batch_end {
                    let mut row_map = HashMap::new();
                    for (col_idx, col) in batch.columns().iter().enumerate() {
                        let col_name = &columns[col_idx];
                        let value = Self::get_value_as_json(col.as_ref(), row_idx);
                        row_map.insert(col_name.clone(), value);
                    }
                    segment_data.push(row_map);
                }
            }

            current_row = batch_end_row;

            // If we've passed the end frame, we can stop reading
            if current_row >= end_frame {
                break;
            }
        }

        Ok(segment_data)
    }

    fn get_parquet_batch_builder(
        parquet_path: &PathBuf,
    ) -> Result<ParquetRecordBatchReaderBuilder<std::fs::File>, String> {
        let file = std::fs::File::open(parquet_path)
            .map_err(|e| format!("Failed to open parquet file {:?}: {}", parquet_path, e))?;

        let builder = ParquetRecordBatchReaderBuilder::try_new(file)
            .map_err(|e| format!("Failed to create ParquetRecordBatchReader: {}", e))?;

        Ok(builder)
    }

    /// Process a parquet file and extract all episodes from it
    fn process_parquet_file_episodes(
        builder: ParquetRecordBatchReaderBuilder<std::fs::File>,
        chunk_name: &str,
        file_name: &str,
    ) -> Result<Vec<EpisodeParquet>, String> {
        let schema = builder.schema();
        let columns: Vec<String> = schema.fields().iter().map(|f| f.name().clone()).collect();

        let mut reader = builder
            .build()
            .map_err(|e| format!("Failed to build ParquetRecordBatchReader: {}", e))?;

        // Calculate total rows by reading all batches
        let mut batches = Vec::new();
        while let Some(batch) = reader
            .next()
            .transpose()
            .map_err(|e| format!("Error reading batch: {}", e))?
        {
            batches.push(batch);
        }

        // Extract actual episodes based on episode_index column
        let episodes = Self::extract_episodes_from_batches(
            &batches,
            chunk_name,
            file_name,
            &columns,
        )?;
        Ok(episodes)
    }

    fn process_parquet_file_data(
        builder: ParquetRecordBatchReaderBuilder<std::fs::File>,
    ) -> Result<(usize, usize), String> {
        let mut total_rows = 0;
        let mut total_size = 0;

        let mut reader = builder
            .build()
            .map_err(|e| format!("Failed to build ParquetRecordBatchReader: {}", e))?;
        while let Some(batch) = reader
            .next()
            .transpose()
            .map_err(|e| format!("Error reading batch: {}", e))?
        {
            total_rows += batch.num_rows();
            total_size += batch.num_rows() * batch.schema().fields().len();
        }

        Ok((total_rows, total_size))
    }

    /// Extract column schema from a parquet file
    fn extract_column_schema(parquet_path: &PathBuf) -> Result<Vec<ColumnData>, String> {
        let file = std::fs::File::open(parquet_path)
            .map_err(|e| format!("Failed to open parquet file {:?}: {}", parquet_path, e))?;

        let builder = ParquetRecordBatchReaderBuilder::try_new(file)
            .map_err(|e| format!("Failed to create ParquetRecordBatchReader: {}", e))?;

        let schema = builder.schema();
        let mut column_schema = Vec::new();

        for field in schema.fields() {
            column_schema.push(ColumnData {
                name: field.name().clone(),
                data_type: format!("{:?}", field.data_type()),
                nullable: field.is_nullable(),
            });
        }

        Ok(column_schema)
    }

    /// Extract episodes from batches based on episode_index column
    fn extract_episodes_from_batches(
        batches: &[arrow::record_batch::RecordBatch],
        chunk_name: &str,
        file_name: &str,
        columns: &[String],
    ) -> Result<Vec<EpisodeParquet>, String> {
        // Find the episode_index column
        let episode_index_col_idx = columns
            .iter()
            .position(|col| col == "episode_index")
            .ok_or_else(|| "episode_index column not found in parquet data")?;

        let mut episodes = Vec::new();
        let mut episode_data: std::collections::HashMap<
            usize,
            Vec<HashMap<String, serde_json::Value>>,
        > = std::collections::HashMap::new();
        let mut episode_row_counts: std::collections::HashMap<usize, usize> =
            std::collections::HashMap::new();

        // Process all batches to group data by episode_index
        for batch in batches {
            let episode_index_col = batch.column(episode_index_col_idx);

            for row_idx in 0..batch.num_rows() {
                let episode_index =
                    Self::get_episode_index_from_array(episode_index_col.as_ref(), row_idx)?;

                // Collect sample data for this episode (limit to 5 rows per episode)
                if episode_data
                    .get(&episode_index)
                    .map_or(true, |data| data.len() < 5)
                {
                    let mut row_map = HashMap::new();
                    for (col_idx, col) in batch.columns().iter().enumerate() {
                        let col_name = &columns[col_idx];
                        let value = Self::get_value_as_json(col.as_ref(), row_idx);
                        row_map.insert(col_name.clone(), value);
                    }
                    episode_data
                        .entry(episode_index)
                        .or_insert_with(Vec::new)
                        .push(row_map);
                }

                // Count rows per episode
                *episode_row_counts.entry(episode_index).or_insert(0) += 1;
            }
        }

        let chunk_id = DatasetMetadataService::get_chunk_id_from_chunk_name(&chunk_name)?;
        let file_id = DatasetMetadataService::get_file_id_from_file_name(&file_name)?;

        // Create ParquetEpisode objects for each unique episode_index
        for (episode_id, _row_count) in episode_row_counts {
            let sample_data = episode_data.get(&episode_id).cloned().unwrap_or_default();

            let episode = EpisodeParquet {
                parquet: sample_data,
                chunk_id,
                file_id,
                episode_id,
                start_frame: None,
                end_frame: None,
                total_frames: None,
            };

            episodes.push(episode);
        }

        // Sort episodes by episode_index
        episodes.sort_by_key(|e| e.episode_id);
        Ok(episodes)
    }

    /// Extract episode index from an array at a specific row
    fn get_episode_index_from_array(array: &dyn Array, row_idx: usize) -> Result<usize, String> {
        match array.data_type() {
            DataType::Int64 => {
                let int_array = array
                    .as_any()
                    .downcast_ref::<Int64Array>()
                    .ok_or_else(|| "Failed to cast to Int64Array")?;
                Ok(int_array.value(row_idx) as usize)
            }
            DataType::UInt64 => {
                let uint_array = array
                    .as_any()
                    .downcast_ref::<arrow::array::UInt64Array>()
                    .ok_or_else(|| "Failed to cast to UInt64Array")?;
                Ok(uint_array.value(row_idx) as usize)
            }
            DataType::Int32 => {
                let int_array = array
                    .as_any()
                    .downcast_ref::<arrow::array::Int32Array>()
                    .ok_or_else(|| "Failed to cast to Int32Array")?;
                Ok(int_array.value(row_idx) as usize)
            }
            DataType::UInt32 => {
                let uint_array = array
                    .as_any()
                    .downcast_ref::<arrow::array::UInt32Array>()
                    .ok_or_else(|| "Failed to cast to UInt32Array")?;
                Ok(uint_array.value(row_idx) as usize)
            }
            _ => Err(format!(
                "Unsupported data type for episode_index: {:?}",
                array.data_type()
            )),
        }
    }

    /// Helper function to convert Arrow array value to serde_json::Value
    pub fn get_value_as_json(array: &dyn Array, row: usize) -> serde_json::Value {
        if array.is_null(row) {
            return serde_json::Value::Null;
        }
        match array.data_type() {
            DataType::Utf8 => {
                let arr = array.as_any().downcast_ref::<StringArray>().unwrap();
                serde_json::Value::String(arr.value(row).to_string())
            }
            DataType::Int64 => {
                let arr = array.as_any().downcast_ref::<Int64Array>().unwrap();
                serde_json::Value::Number(arr.value(row).into())
            }
            DataType::Float64 => {
                let arr = array.as_any().downcast_ref::<Float64Array>().unwrap();
                serde_json::Value::Number(
                    serde_json::Number::from_f64(arr.value(row))
                        .unwrap_or(serde_json::Number::from(0)),
                )
            }
            DataType::Boolean => {
                let arr = array.as_any().downcast_ref::<BooleanArray>().unwrap();
                serde_json::Value::Bool(arr.value(row))
            }
            DataType::List(_) => {
                let arr = array.as_any().downcast_ref::<ListArray>().unwrap();
                let list_values = arr.value(row);
                let mut json_array = Vec::new();

                // Convert each element in the list to JSON
                for i in 0..list_values.len() {
                    let element_value = Self::get_value_as_json(list_values.as_ref(), i);
                    json_array.push(element_value);
                }

                serde_json::Value::Array(json_array)
            }
            DataType::Dictionary(_, _) => {
                // Handle dictionary arrays (commonly used for categorical data)
                let dict_array = array
                    .as_any()
                    .downcast_ref::<DictionaryArray<Int32Type>>()
                    .expect("Failed to downcast to DictionaryArray");

                let keys = dict_array.keys();
                let values = dict_array.values();

                let key = keys.value(row) as usize;

                // Recursively convert the dictionary value to JSON
                Self::get_value_as_json(values.as_ref(), key)
            }
            DataType::Null => serde_json::Value::Null,
            _ => serde_json::Value::String(format!("<unsupported: {:?}>", array.data_type())),
        }
    }
}
