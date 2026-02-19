import { invoke } from '@tauri-apps/api/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/hooks/default';
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

export const getAiModel = async (id: string): Promise<AiModel | null> => {
    return await invoke<AiModel | null>('get_ai_model', { id });
};

export const addAiModel = async (model: AiModel): Promise<AiModel> => {
    return await invoke<AiModel>('add_ai_model', { model });
};

export const updateAiModel = async (model: AiModel): Promise<AiModel> => {
    return await invoke<AiModel>('update_ai_model', { model });
};

export const deleteAiModel = async (id: string): Promise<boolean> => {
    return await invoke<boolean>('delete_ai_model', { id });
};

export const useGetAiModel = (id: string, enabled = true) =>
    useQuery({
        queryKey: [...AI_MODEL_KEY, 'id', id],
        queryFn: async () => {
            if (!enabled) return null;
            return await getAiModel(id);
        },
        enabled: enabled && !!id,
    });

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

export const useAddAiModel = () =>
    useMutation({
        mutationFn: async (model: AiModel) => addAiModel(model),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: AI_MODEL_KEY });
        },
    });

export const useUpdateAiModel = () =>
    useMutation({
        mutationFn: async (model: AiModel) => updateAiModel(model),
        onSuccess: (model) => {
            queryClient.invalidateQueries({ queryKey: AI_MODEL_KEY });
            if (model?.id) {
                queryClient.invalidateQueries({ queryKey: [...AI_MODEL_KEY, 'id', model.id] });
            }
        },
    });

export const useDeleteAiModel = () =>
    useMutation({
        mutationFn: async (id: string) => deleteAiModel(id),
        onSuccess: (_result, id) => {
            queryClient.invalidateQueries({ queryKey: AI_MODEL_KEY });
            queryClient.invalidateQueries({ queryKey: [...AI_MODEL_KEY, 'id', id] });
        },
    });
