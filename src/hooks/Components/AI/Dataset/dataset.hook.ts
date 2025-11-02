import { getAllDatasets, getDatasets, getDataset, getAllDatasetCount, getDatasetCount } from '@/api/Local/AI/dataset';
import type { Dataset } from '@/types/Module/Dataset/dataset';
import type { PaginatedResponse } from '@/types/PaginatedResponse';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/hooks/default';

export const BASE_DATASET_KEY = 'dataset';

//----------------------------------------------------------------------------
// Get Datasets Functions
//----------------------------------------------------------------------------
export const useGetAllDatasets = (pageSize: number = 30, enabled = true) =>
    useInfiniteQuery({
        queryKey: [BASE_DATASET_KEY, 'infinite', 'lerobot', pageSize],
        queryFn: async ({ pageParam }) => {
            if (!enabled) return null;

            const page = pageParam || 1;
            return await getAllDatasets({
                page,
                page_size: pageSize,
            });
        },
        initialPageParam: 1, // Start with page 1
        getNextPageParam: (lastPage: PaginatedResponse<Dataset> | null) => {
            if (!lastPage || !lastPage.has_next) {
                return undefined; // No more pages
            }
            return lastPage.page + 1;
        },
        getPreviousPageParam: (firstPage: PaginatedResponse<Dataset> | null) => {
            if (!firstPage || !firstPage.has_previous) {
                return undefined; // No previous pages
            }
            return firstPage.page - 1;
        },
        refetchOnWindowFocus: false,
        enabled,
    });

export const useGetDatasets = (nickname: string, pageSize: number = 30, enabled = true) =>
    useInfiniteQuery({
        queryKey: [BASE_DATASET_KEY, 'infinite', 'lerobot', nickname, pageSize],
        queryFn: async ({ pageParam }) => {
            if (!enabled) return null;

            // pageParam will be the page number, starting from 1
            const page = pageParam || 1;

            return await getDatasets(nickname, {
                page,
                page_size: pageSize,
            });
        },
        initialPageParam: 1, // Start with page 1
        getNextPageParam: (lastPage: PaginatedResponse<Dataset> | null) => {
            if (!lastPage || !lastPage.has_next) {
                return undefined; // No more pages
            }
            return lastPage.page + 1;
        },
        getPreviousPageParam: (firstPage: PaginatedResponse<Dataset> | null) => {
            if (!firstPage || !firstPage.has_previous) {
                return undefined; // No previous pages
            }
            return firstPage.page - 1;
        },
        refetchOnWindowFocus: false,
        enabled,
    });

//----------------------------------------------------------------------------
// Get Dataset Functions
//----------------------------------------------------------------------------

export const useGetDataset = (nickname: string, dataset: string, enabled = true) =>
    useQuery({
        queryKey: [BASE_DATASET_KEY, nickname, dataset],
        queryFn: async () => {
            if (!enabled || !nickname || !dataset) return null;

            return await getDataset(nickname, dataset);
        },
        refetchOnWindowFocus: false,
        enabled: enabled && !!nickname && !!dataset,
    });

//----------------------------------------------------------------------------
// Count Dataset Functions
//----------------------------------------------------------------------------

export const useGetAllDatasetCount = (enabled = true) =>
    useQuery({
        queryKey: [BASE_DATASET_KEY, 'count', 'all'],
        queryFn: async () => {
            return await getAllDatasetCount();
        },
        enabled: enabled,
    });

export const useGetDatasetCount = (nickname: string, enabled = true) =>
    useQuery({
        queryKey: [BASE_DATASET_KEY, 'count', nickname],
        queryFn: async () => {
            return await getDatasetCount(nickname);
        },
        enabled: enabled && !!nickname,
    });

//---------------------------------------------------------------------------------------------------//
// Local Dataset Functions
//---------------------------------------------------------------------------------------------------//
export const SELECTED_DATASETS_KEY = [BASE_DATASET_KEY, 'selected'];

export const getSelectedDatasets = () => queryClient.getQueryData(SELECTED_DATASETS_KEY);
export const setSelectedDatasets = (content: any) => queryClient.setQueryData(SELECTED_DATASETS_KEY, content);
export const useGetSelectedDatasets = () =>
    useQuery({
        queryKey: SELECTED_DATASETS_KEY,
        queryFn: () => getSelectedDatasets() ?? [],
        staleTime: Infinity,
        gcTime: Infinity,
    });
//---------------------------------------------------------------------------------------------------//
