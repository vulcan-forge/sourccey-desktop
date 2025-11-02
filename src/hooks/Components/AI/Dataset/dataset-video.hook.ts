import { useState, useEffect } from 'react';
import type { VideoData, VideoEpisode } from '@/types/Module/Dataset/dataset-video';
import { invoke } from '@tauri-apps/api/core';
import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const EPISODE_VIDEO_QUERY_KEY = (nickname: string, dataset: string, episode: number) => 
    ['episode-video', nickname, dataset, episode] as const;

export const useGetDatasetVideoData = (nickname: string, dataset: string) => {
    const [videoData, setVideoData] = useState<VideoData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!nickname || !dataset) {
            setVideoData(null);
            return;
        }

        const loadVideos = async () => {
            setIsLoading(true);
            setError(null);
            try {
                console.log('Loading videos for dataset:', nickname, dataset);
                const data = await invoke<VideoData>('get_dataset_video_data', { nickname, dataset });
                console.log('Loaded videos for dataset:', data);
                setVideoData(data);
            } catch (err) {
                console.error('Error loading videos:', err);
                setError(err instanceof Error ? err.message : 'Failed to load videos');
            } finally {
                setIsLoading(false);
            }
        };

        loadVideos();
    }, [nickname, dataset]);

    return { videoData, isLoading, error };
};

export const useGetEpisodeVideos = (nickname: string, dataset: string, episode: number, cameraCount: number) => {
    const [isLoadingAll, setIsLoadingAll] = useState(false);
    const [hasError, setHasError] = useState<string | null>(null);
    const { data: cachedVideos }: any = useGetVideos(nickname, dataset, episode);

    useEffect(() => {
        if (!nickname || !dataset || cameraCount === 0) {
            setVideos(nickname, dataset, episode, {});
            return;
        }

        // If we already have cached videos, don't reload
        if (cachedVideos && Object.keys(cachedVideos).length > 0) {
            console.log('Using cached videos:', cachedVideos);
            return;
        }

        const loadAllCameraVideos = async () => {
            setIsLoadingAll(true);
            setHasError(null);
            
            // Initialize state for all cameras
            const initialVideos = {};
            setVideos(nickname, dataset, episode, initialVideos);

            // Create promises for all cameras
            const loadPromises = Array.from({ length: cameraCount }, async (_, cameraId) => {
                try {
                    const videoData = await invoke<VideoEpisode>('get_episode_video', { 
                        nickname, 
                        dataset, 
                        episodeId: episode, 
                        cameraId 
                    });
                    console.log('Loaded video data:', videoData);

                    if (!videoData.video) {
                        throw new Error(`No video data returned for camera ${cameraId}`);
                    }

                    const blob = new Blob([new Uint8Array(videoData.video)], { type: 'video/mp4' });
                    const url = URL.createObjectURL(blob);

                    // Update state for this specific camera
                    setVideos(nickname, dataset, episode, (prev: any) => ({
                        ...prev,
                        [cameraId]: {
                            videoUrl: url,
                            cameraName: videoData.camera_name,
                            isLoading: false,
                            error: null
                        }
                    }));

                    return { cameraId, success: true };
                } catch (err) {
                    console.error(`Error loading video for camera ${cameraId}:`, err);
                    const errorMessage = err instanceof Error ? err.message : 'Failed to load video';
                    
                    // Update state for this specific camera with error
                    setVideos(nickname, dataset, episode, (prev: any) => ({
                        ...prev,
                        [cameraId]: {
                            videoUrl: null,
                            cameraName: '',
                            isLoading: false,
                            error: errorMessage
                        }
                    }));

                    return { cameraId, success: false, error: errorMessage };
                }
            });

            // Wait for all videos to complete (success or failure)
            const results = await Promise.allSettled(loadPromises);
            
            // Check if any videos failed
            const failedCameras = results
                .filter((result): result is PromiseFulfilledResult<{ cameraId: number; success: boolean; error?: string }> => 
                    result.status === 'fulfilled' && !result.value.success)
                .map(result => result.value);

            if (failedCameras.length > 0) {
                setHasError(`Failed to load ${failedCameras.length} camera(s): ${failedCameras.map(c => `Camera ${c.cameraId}`).join(', ')}`);
            }

            setIsLoadingAll(false);
        };

        loadAllCameraVideos();
    }, [nickname, dataset, episode, cameraCount, cachedVideos]);

    // Create videos array from cachedVideos
    let videos = null;
    if (cachedVideos && Object.keys(cachedVideos).length > 0) {
        videos = Object.entries(cachedVideos).map(([cameraIdStr, videoData]: any) => {
            const cameraId = parseInt(cameraIdStr);
            return {
                id: `episode-camera-${cameraId}`,
                title: `Episode ${episode}`,
                camera: videoData?.cameraName,
                url: videoData?.videoUrl,
                isLoading: videoData?.isLoading,
                error: videoData?.error,
            };
        });
    }

    // Check if any video is still loading
    let isLoadingVideo: any = isLoadingAll;
    if (cachedVideos && Object.keys(cachedVideos).length > 0) {
        isLoadingVideo = isLoadingAll || Object.values(cachedVideos).some((video: any) => video?.isLoading);
    }
    
    // Check if there are any errors
    let videoError: any = hasError;
    if (cachedVideos && Object.keys(cachedVideos).length > 0) {
        videoError = hasError || Object.values(cachedVideos).find((video: any) => video?.error);
    }

    return { 
        videos, 
        isLoading: isLoadingVideo, 
        error: videoError
    };
};

// Cache Hooks
export const getVideos = (nickname: string, dataset: string, episode: number) => queryClient.getQueryData(EPISODE_VIDEO_QUERY_KEY(nickname, dataset, episode) ?? {});

export const setVideos = (nickname: string, dataset: string, episode: number, video: any) => queryClient.setQueryData(EPISODE_VIDEO_QUERY_KEY(nickname, dataset, episode), video);

export const useGetVideos = (nickname: string, dataset: string, episode: number) => useQuery({
    queryKey: EPISODE_VIDEO_QUERY_KEY(nickname, dataset, episode),
    queryFn: () => getVideos(nickname, dataset, episode) ?? {},
});

// Component Hooks
export const VIDEO_GRID_SIZE_QUERY_KEY = ['videoGridSize'];
export const getVideoGridSize = () => queryClient.getQueryData(VIDEO_GRID_SIZE_QUERY_KEY);

export const setVideoGridSize = (size: 'small' | 'large') => queryClient.setQueryData(VIDEO_GRID_SIZE_QUERY_KEY, size);

export const useVideoGridSize = () => useQuery({
        queryKey: VIDEO_GRID_SIZE_QUERY_KEY,
        queryFn: () => getVideoGridSize() ?? 'large',
    });