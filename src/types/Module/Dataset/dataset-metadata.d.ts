// Main dataset metadata structure
export interface DatasetMetadata {
    codebase_version: string;
    robot_type: string;
    total_episodes: number;
    total_frames: number;
    total_tasks: number;
    chunks_size: number;
    data_files_size_in_mb: number;
    video_files_size_in_mb: number;
    fps: number;
    splits: Record<string, string>;
    data_path: string;
    video_path: string;
    features: Record<string, FeatureMetadata>;
}

export interface FeatureMetadata {
    dtype: string;
    names?: string[];
    shape: number[];
    info?: Record<string, any>;
}

// Individual episode metadata
export interface EpisodeMetadata {
    episode_index: number;
    tasks: string[];
    length: number;
    data_chunk_index: number;
    data_file_index: number;
    dataset_from_index: number;
    dataset_to_index: number;
    cameras: CameraMetadata[];
    action_stats?: ActionStats;
    observation_state_stats?: ObservationStateStats;
    camera_stats: Record<string, CameraStats>; // camera_name -> stats
    timestamp_stats?: TimestampStats;
    frame_index_stats?: FrameIndexStats;
    episode_index_stats?: EpisodeIndexStats;
    index_stats?: IndexStats;
    task_index_stats?: TaskIndexStats;
    meta_episodes_chunk_index?: number;
    meta_episodes_file_index?: number;
    file_size: number;
    created_at: string;
}

// Camera metadata for each episode
export interface CameraMetadata {
    camera_name: string;
    chunk_index: number;
    file_index: number;
    from_timestamp?: number;
    to_timestamp?: number;
}

// Generic stats structure for all statistical data
export interface Stats {
    min?: number;
    max?: number;
    mean?: number;
    std?: number;
    count?: number;
}

// Specific stats types for different data categories

// Action statistics: "stats/action/min", "stats/action/max", etc.
export interface ActionStats {
    min?: number;
    max?: number;
    mean?: number;
    std?: number;
    count?: number;
}

// Observation state statistics: "stats/observation.state/min", etc.
export interface ObservationStateStats {
    min?: number;
    max?: number;
    mean?: number;
    std?: number;
    count?: number;
}

// Camera statistics: "stats/observation.images.main/max", etc.
export interface CameraStats {
    min?: number;
    max?: number;
    mean?: number;
    std?: number;
    count?: number;
}

// Timestamp statistics: "stats/timestamp/mean", etc.
export interface TimestampStats {
    min?: number;
    max?: number;
    mean?: number;
    std?: number;
    count?: number;
}

// Frame index statistics: "stats/frame_index/max", etc.
export interface FrameIndexStats {
    min?: number;
    max?: number;
    mean?: number;
    std?: number;
    count?: number;
}

// Episode index statistics: "stats/episode_index/mean", etc.
export interface EpisodeIndexStats {
    min?: number;
    max?: number;
    mean?: number;
    std?: number;
    count?: number;
}

// Index statistics: "stats/index/std", etc.
export interface IndexStats {
    min?: number;
    max?: number;
    mean?: number;
    std?: number;
    count?: number;
}

// Task index statistics: "stats/task_index/min", etc.
export interface TaskIndexStats {
    min?: number;
    max?: number;
    mean?: number;
    std?: number;
    count?: number;
}
