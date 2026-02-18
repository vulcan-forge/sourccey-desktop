import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const SELECTED_MODEL_KEY = ['selected-model'];

export type SelectedModel = {
    id: string;
    repoId: string;
    name: string;
    tier?: 'free' | 'premium' | 'downloaded';
    rating?: string;
    strength?: string;
    clothingTypes?: string;
    highestCheckpointStep?: number | null;
    policyType?: string | null;
    fullRepoId?: string | null;
    image?: string | null;
    pretrainedModelPath?: string | null;
};

export const getSelectedModel = () => queryClient.getQueryData<SelectedModel | null>(SELECTED_MODEL_KEY) ?? null;

export const setSelectedModel = (model: SelectedModel | null) => queryClient.setQueryData(SELECTED_MODEL_KEY, model);

export const useSelectedModel = () =>
    useQuery({
        queryKey: SELECTED_MODEL_KEY,
        queryFn: () => getSelectedModel(),
        staleTime: Infinity,
        gcTime: Infinity,
    });
