import { getAIModel, getAIModelCount, getAIModels, getAllAIModelCount, getAllAIModels } from '@/api/Local/AI/ai_models';
import { queryClient } from '@/hooks/default';
import type { AIModel } from '@/types/Module/AIModels/ai-model';
import type { PaginatedResponse } from '@/types/PaginatedResponse';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

export const BASE_AI_MODEL_KEY = 'ai-model';

export const useGetAllAIModels = (pageSize: number = 30, enabled = true) =>
    useInfiniteQuery({
        queryKey: [BASE_AI_MODEL_KEY, 'infinite', 'lerobot', pageSize],
        queryFn: async ({ pageParam }) => {
            if (!enabled) return null;

            const page = pageParam || 1;

            return await getAllAIModels({
                page,
                page_size: pageSize,
            });
        },
        initialPageParam: 1, // Start with page 1
        getNextPageParam: (lastPage: PaginatedResponse<AIModel> | null) => {
            if (!lastPage || !lastPage.has_next) {
                return undefined; // No more pages
            }
            return lastPage.page + 1;
        },
        getPreviousPageParam: (firstPage: PaginatedResponse<AIModel> | null) => {
            if (!firstPage || !firstPage.has_previous) {
                return undefined; // No previous pages
            }
            return firstPage.page - 1;
        },
        refetchOnWindowFocus: false,
        enabled,
    });

export const useGetAIModels = (repo_id: string, pageSize: number = 30, enabled = true) =>
    useInfiniteQuery({
        queryKey: [BASE_AI_MODEL_KEY, 'infinite', 'lerobot', repo_id, pageSize],
        queryFn: async ({ pageParam }) => {
            if (!enabled) return null;

            // pageParam will be the page number, starting from 1
            const page = pageParam || 1;

            return await getAIModels(repo_id, {
                page,
                page_size: pageSize,
            });
        },
        initialPageParam: 1, // Start with page 1
        getNextPageParam: (lastPage: PaginatedResponse<AIModel> | null) => {
            if (!lastPage || !lastPage.has_next) {
                return undefined; // No more pages
            }
            return lastPage.page + 1;
        },
        getPreviousPageParam: (firstPage: PaginatedResponse<AIModel> | null) => {
            if (!firstPage || !firstPage.has_previous) {
                return undefined; // No previous pages
            }
            return firstPage.page - 1;
        },
        refetchOnWindowFocus: false,
        enabled,
    });

export const useGetAIModel = (repo_id: string, name: string, enabled = true) =>
    useQuery({
        queryKey: [BASE_AI_MODEL_KEY, repo_id, name],
        queryFn: async () => {
            if (!enabled) return null;

            return await getAIModel(repo_id, name);
        },
        enabled: enabled && !!repo_id && !!name,
    });

export const useGetAllAIModelCount = (enabled = true) =>
    useQuery({
        queryKey: [BASE_AI_MODEL_KEY, 'count', 'all'],
        queryFn: async () => {
            return await getAllAIModelCount();
        },
        enabled: enabled,
    });

export const useGetAIModelCount = (repo_id: string, enabled = true) =>
    useQuery({
        queryKey: [BASE_AI_MODEL_KEY, 'count', repo_id],
        queryFn: async () => {
            return await getAIModelCount(repo_id);
        },
        enabled: enabled && !!repo_id,
    });

//---------------------------------------------------------------------------------------------------//
// Local AI Model Functions
//---------------------------------------------------------------------------------------------------//
export const SELECTED_AI_MODEL_KEY = [BASE_AI_MODEL_KEY, 'selected'];

export const getSelectedAIModel = () => queryClient.getQueryData(SELECTED_AI_MODEL_KEY);
export const setSelectedAIModel = (content: AIModel | null) => {
    console.log('setting selectedAIModel', content);
    return queryClient.setQueryData(SELECTED_AI_MODEL_KEY, content);
};
export const useGetSelectedAIModel = () =>
    useQuery({
        queryKey: SELECTED_AI_MODEL_KEY,
        queryFn: () => getSelectedAIModel() ?? null,
        staleTime: Infinity,
        gcTime: Infinity,
    });
//---------------------------------------------------------------------------------------------------//
