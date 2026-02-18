import type {
    AIModel,
    HuggingFaceDownloadProgressEvent,
    HuggingFaceModelDownloadCompletionEvent,
    HuggingFaceModelDeleteResult,
    HuggingFaceModelDownloadResponse,
    HuggingFaceModelDownloadResult,
    HuggingFaceOrganizationCatalog,
} from '@/types/Module/AIModels/ai-model';
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

export const downloadAIModelFromHuggingFace = async (repo_input: string): Promise<AIModel> => {
    const result = await invoke<AIModel>('download_ai_model_from_huggingface', {
        repoInput: repo_input,
    });
    return result;
};

export const getHuggingFaceOrganizationModels = async (
    organization: string,
): Promise<HuggingFaceOrganizationCatalog> => {
    const result = await invoke<HuggingFaceOrganizationCatalog>('get_huggingface_organization_models', {
        organization,
    });
    return result;
};

export const downloadHuggingFaceModelToCache = async (repo_id: string): Promise<HuggingFaceModelDownloadResult> => {
    const result = await invoke<HuggingFaceModelDownloadResult>('download_huggingface_model_to_cache', {
        repoId: repo_id,
    });
    return result;
};

export const deleteHuggingFaceModelFromCache = async (
    repo_id: string,
): Promise<HuggingFaceModelDeleteResult> => {
    const result = await invoke<HuggingFaceModelDeleteResult>('delete_huggingface_model_from_cache', {
        repoId: repo_id,
    });
    return result;
};

export const downloadHuggingFaceModelToCacheWithProgress = async (
    repo_id: string,
    replace_existing: boolean,
): Promise<HuggingFaceModelDownloadResponse> => {
    const result = await invoke<HuggingFaceModelDownloadResponse>('download_huggingface_model_to_cache_with_progress', {
        repoId: repo_id,
        replaceExisting: replace_existing,
    });
    return result;
};

export const startHuggingFaceModelDownload = async (
    repo_id: string,
    replace_existing: boolean,
): Promise<string> => {
    const result = await invoke<string>('start_huggingface_model_download', {
        repoId: repo_id,
        replaceExisting: replace_existing,
    });
    return result;
};

export type { HuggingFaceDownloadProgressEvent, HuggingFaceModelDownloadCompletionEvent };
