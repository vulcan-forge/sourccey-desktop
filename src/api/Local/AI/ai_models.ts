import type { AIModel } from '@/types/Module/AIModels/ai-model';
import type { PaginatedResponse, PaginationParameters } from '@/types/PaginatedResponse';
import { invoke } from '@tauri-apps/api/core';

export const getAllAIModels = async (paginationParams?: PaginationParameters): Promise<PaginatedResponse<AIModel>> => {
    const result = await invoke<PaginatedResponse<AIModel>>('get_all_ai_models', {
        pagination: paginationParams || { page: 1, page_size: 30 },
    });
    return result;
};

export const getAIModels = async (repo_id: string, paginationParams?: PaginationParameters): Promise<PaginatedResponse<AIModel>> => {
    const result = await invoke<PaginatedResponse<AIModel>>('get_ai_models', {
        repoId: repo_id,
        pagination: paginationParams || { page: 1, page_size: 30 },
    });
    return result;
};

export const getAIModel = async (repo_id: string, name: string): Promise<AIModel | null> => {
    const result = await invoke<AIModel | null>('get_ai_model', {
        repoId: repo_id,
        name,
    });
    return result;
};

export const getAllAIModelCount = async (): Promise<number> => {
    const result = await invoke<number>('count_all_ai_models');
    return result;
};

export const getAIModelCount = async (repo_id: string): Promise<number> => {
    const result = await invoke<number>('count_ai_models', { repoId: repo_id });
    return result;
};
