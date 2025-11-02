import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_BACK_BUTTON_KEY = 'back-button';

export const DATA_BACK_BUTTON_KEY = [BASE_BACK_BUTTON_KEY, 'data'];
export const AIModel_BACK_BUTTON_KEY = [BASE_BACK_BUTTON_KEY, 'ai-models'];

export const DEFAULT_DATASET_BACK_BUTTON_URL = '/app/data';
export const DEFAULT_AIMODEL_BACK_BUTTON_URL = '/app/ai-models';

//---------------------------------------------------------------------------------------------------//
// Data Back Functions
//---------------------------------------------------------------------------------------------------//
export const getDataBackButton = () => queryClient.getQueryData(DATA_BACK_BUTTON_KEY) ?? DEFAULT_DATASET_BACK_BUTTON_URL;
export const setDataBackButton = (content: any) => queryClient.setQueryData(DATA_BACK_BUTTON_KEY, content);
export const useGetDataBackButton = () =>
    useQuery({ queryKey: DATA_BACK_BUTTON_KEY, queryFn: () => getDataBackButton() ?? DEFAULT_DATASET_BACK_BUTTON_URL });
//---------------------------------------------------------------------------------------------------//

//---------------------------------------------------------------------------------------------------//
// AI Model Back Functions
//---------------------------------------------------------------------------------------------------//
export const getAIModelBackButton = () => queryClient.getQueryData(AIModel_BACK_BUTTON_KEY) ?? DEFAULT_AIMODEL_BACK_BUTTON_URL;
export const setAIModelBackButton = (content: any) => queryClient.setQueryData(AIModel_BACK_BUTTON_KEY, content);
export const useGetAIModelBackButton = () =>
    useQuery({ queryKey: AIModel_BACK_BUTTON_KEY, queryFn: () => getAIModelBackButton() ?? DEFAULT_AIMODEL_BACK_BUTTON_URL });
//---------------------------------------------------------------------------------------------------//
