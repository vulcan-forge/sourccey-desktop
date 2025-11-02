export interface ParquetDataset {
    dataset_name: string;
    total_episodes: number;
    total_rows: number;
    total_size: number;
    chunks: string[];
    episodes: ParquetEpisode[];
    column_schema: ColumnInfo[];
}

export interface ParquetEpisode {
    episode_id: number;
    chunk_id: number;
    file_id: number;
    file_path: string;
    row_count: number;
    columns: string[];
    sample_data: Record<string, any>[];
    file_size: number;
    created_at: string;
    data_start_index: number;
    data_end_index: number;
}

export interface ColumnInfo {
    name: string;
    data_type: string;
    nullable: boolean;
}

export interface EpisodeDataInfo {
    chunk_id: string;
    file_index: number;
    data_start_index: number;
    data_end_index: number;
    frame_count: number;
    columns: string[];
    sample_data: Record<string, any>[];
    file_size: number;
}
