import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import type { ParquetDataset, ParquetEpisode } from '@/types/Module/Dataset/dataset-parquet';

export const BASE_DATASET_PARQUET_KEY = 'dataset-parquet';

export const useGetDatasetParquet = (datasetPath: string | null) => {
    return useQuery({
        queryKey: [BASE_DATASET_PARQUET_KEY, datasetPath],
        queryFn: async () => {
            if (!datasetPath) return null;
            return await invoke<ParquetDataset>('get_dataset_parquet_data', {
                datasetPath,
            });
        },
        enabled: !!datasetPath,
        refetchOnWindowFocus: false,
    });
};

export const useGetEpisodeParquet = (nickname: string, dataset: string, episodeId: number | null) => {
    return useQuery({
        queryKey: [BASE_DATASET_PARQUET_KEY, 'episode', nickname, dataset, episodeId],
        queryFn: async () => {
            if (!nickname || !dataset || episodeId === null) return null;
            return await invoke<ParquetEpisode>('get_episode_parquet', { 
                nickname, 
                dataset, 
                episodeId 
            });
        },
        enabled: !!nickname && !!dataset && episodeId !== null,
        refetchOnWindowFocus: false,
    });
};
