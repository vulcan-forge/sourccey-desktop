import type { TrainingConfig } from '@/components/PageComponents/OwnedRobots/Training/TrainingConfig';
import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export const BASE_TRAINING_CONFIG_KEY = 'training-config';

export const TRAINING_CONFIG_KEY = (model_name: string) => [BASE_TRAINING_CONFIG_KEY, model_name];

//---------------------------------------------------------------------------------------------------//
// Is Training
//---------------------------------------------------------------------------------------------------//
export const getIsTraining = (model_name: string | null) => queryClient.getQueryData(TRAINING_CONFIG_KEY(model_name ?? '')) ?? false;

export const setIsTraining = (model_name: string | null, isTraining: boolean) =>
    queryClient.setQueryData(TRAINING_CONFIG_KEY(model_name ?? ''), isTraining);

export const useGetIsTraining = (model_name: string | null) =>
    useQuery({ queryKey: TRAINING_CONFIG_KEY(model_name ?? ''), queryFn: () => getIsTraining(model_name) });

//---------------------------------------------------------------------------------------------------//
// Is Training Exists
//---------------------------------------------------------------------------------------------------//
export const getTrainingExists = async (training_config: TrainingConfig) => {
    if (!training_config) {
        return true;
    }

    try {
        const config = {
            repo_dir: training_config?.repo_dir,
            dataset: training_config?.dataset,
            policy_type: training_config?.policy_type,
            model_name: training_config?.model_name,
            batch_size: training_config?.batch_size,
            steps: training_config?.steps,
            distributed_training: training_config?.distributed_training === 'enabled',
            num_gpus: training_config?.num_gpus,
        };
        console.log('config', config);
        const result = await invoke('training_exists', { config });
        console.log('result', result);
        return result;
    } catch (error) {
        console.error('Error getting training exists', error);
        return false;
    }
};

export const useGetTrainingExists = (training_config: TrainingConfig) =>
    useQuery({ queryKey: TRAINING_CONFIG_KEY(training_config?.model_name ?? ''), queryFn: () => getTrainingExists(training_config) });
