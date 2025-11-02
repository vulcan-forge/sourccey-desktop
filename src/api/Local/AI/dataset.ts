import type { PaginatedResponse, PaginationParameters } from '@/types/PaginatedResponse';
import type { Dataset } from '@/types/Module/Dataset/dataset';
import { invoke } from '@tauri-apps/api/core';

//----------------------------------------------------------------------------
// Get Datasets Functions
//----------------------------------------------------------------------------
export const getAllDatasets = async (paginationParams?: PaginationParameters): Promise<PaginatedResponse<Dataset>> => {
    const result = await invoke<PaginatedResponse<Dataset>>('get_all_datasets', {
        pagination: paginationParams || { page: 1, page_size: 30 },
    });
    return result;
};

export const getDatasets = async (nickname: string, paginationParams?: PaginationParameters): Promise<PaginatedResponse<Dataset>> => {
    const result = await invoke<PaginatedResponse<Dataset>>('get_datasets', {
        nickname: nickname,
        pagination: paginationParams || { page: 1, page_size: 30 },
    });
    return result;
};

//----------------------------------------------------------------------------
// Get Dataset Functions
//----------------------------------------------------------------------------
export const getDataset = async (nickname: string, dataset: string): Promise<Dataset | null> => {
    const result = await invoke<Dataset | null>('get_dataset', {
        nickname: nickname,
        dataset: dataset,
    });
    return result;
};

//----------------------------------------------------------------------------
// Count Dataset Functions
//----------------------------------------------------------------------------
export const getAllDatasetCount = async (): Promise<number> => {
    const result = await invoke<number>('count_all_datasets');
    return result;
};

export const getDatasetCount = async (repo_id: string): Promise<number> => {
    const result = await invoke<number>('count_datasets', {
        repoId: repo_id,
    });
    return result;
};
