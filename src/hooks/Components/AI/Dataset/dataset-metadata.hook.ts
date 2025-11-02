import type { DatasetMetadata, EpisodeMetadata } from '@/types/Module/Dataset/dataset-metadata';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

export const BASE_DATASET_METADATA_KEY = 'dataset-metadata';

export const useGetDatasetMetadata = (nickname: string, dataset: string) => {
    return useQuery({
        queryKey: [BASE_DATASET_METADATA_KEY, nickname, dataset],
        queryFn: async () => {
            if (!nickname || !dataset) return null;
            return await invoke<DatasetMetadata>('get_dataset_metadata', { nickname, dataset });
        },
    });
};

export const useGetEpisodeMetadata = (datasetPath: string | null, episodeIndex: number) => {
    const [episodeMetadata, setEpisodeMetadata] = useState<EpisodeMetadata | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!datasetPath) {
            setEpisodeMetadata(null);
            return;
        }

        const loadEpisodeMetadata = async () => {
            setIsLoading(true);
            setError(null);
            try {
                console.log('Loading episode metadata:', datasetPath);
                const data = await invoke<EpisodeMetadata>('get_episode_metadata', { datasetPath, episodeIndex });
                console.log('Loaded episode metadata:', data);
                setEpisodeMetadata(data);
            } catch (err) {
                console.error('Error loading episode metadata:', err);
                setError(err instanceof Error ? err.message : 'Failed to load episode metadata');
            } finally {
                setIsLoading(false);
            }
        };

        loadEpisodeMetadata();
    }, [datasetPath, episodeIndex]);

    return { episodeMetadata, isLoading, error };
};
