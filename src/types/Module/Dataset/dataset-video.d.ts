export interface VideoData {
    dataset_name: string;
    total_videos: number;
    cameras: string[];
}

export interface VideoEpisode {
    video?: Uint8Array;
    chunk_id: number;
    file_id: number;
    episode_id: number;
    camera_name: string;
    total_duration?: number;
    start_frame?: number;
    end_frame?: number;
    total_frames?: number;
}
