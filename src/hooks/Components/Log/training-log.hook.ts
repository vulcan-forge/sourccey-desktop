import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_TRAINING_LOG_KEY = 'training-log';

export const TRAINING_LOG_KEY = (model: string) => [BASE_TRAINING_LOG_KEY, model];
export const ALL_TRAINING_LOG_KEY = [BASE_TRAINING_LOG_KEY, 'training-logs', 'all'];

//---------------------------------------------------------------------------------------------------//
// Training Logs
//---------------------------------------------------------------------------------------------------//
export const getTrainingLogs = (model: string) => queryClient.getQueryData(TRAINING_LOG_KEY(model)) ?? [];
export const setTrainingLogs = (model: string, logs: string[] | null) => {
    if (logs === null) {
        queryClient.removeQueries({ queryKey: TRAINING_LOG_KEY(model) });

        // Remove the model from all training logs
        const allLogs: { [key: string]: string[] } = { ...getAllTrainingLogs() };
        delete allLogs[model];
        queryClient.setQueryData(ALL_TRAINING_LOG_KEY, { ...allLogs });
        return;
    }

    queryClient.setQueryData(TRAINING_LOG_KEY(model), logs);
    queryClient.setQueryData(ALL_TRAINING_LOG_KEY, { ...getAllTrainingLogs(), [model ?? '']: logs });
};
export const useGetTrainingLogs = (model: string) => useQuery({ queryKey: TRAINING_LOG_KEY(model), queryFn: () => getTrainingLogs(model) });

//---------------------------------------------------------------------------------------------------//
// All Logs
//---------------------------------------------------------------------------------------------------//
export const getAllTrainingLogs = () => queryClient.getQueryData(ALL_TRAINING_LOG_KEY) ?? {};
export const useGetAllTrainingLogs = () => useQuery({ queryKey: ALL_TRAINING_LOG_KEY, queryFn: () => getAllTrainingLogs() });
