import { invoke } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import type { PaginatedResponse } from '@/types/PaginatedResponse';

export type AiModel = {
    id: string;
    name: string;
    model_path: string;
    created_at?: string | null;
    updated_at?: string | null;
    deleted_at?: string | null;
};

export const AI_MODEL_KEY = ['ai-models'];

export const useGetAiModelsPaginated = (page: number = 1, pageSize: number = 20, enabled = true) =>
    useQuery({
        queryKey: [...AI_MODEL_KEY, 'paginated', page, pageSize],
        queryFn: async (): Promise<PaginatedResponse<AiModel>> => {
            return await invoke('get_ai_models_paginated', {
                pagination: { page, page_size: pageSize },
            });
        },
        enabled,
    });
