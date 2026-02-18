import type { EvaluateConfig, EvaluateDatasetConfig } from '@/components/PageComponents/Robots/Evaluate/EvaluateConfig';
import type { RecordDatasetConfig } from '@/components/PageComponents/Robots/Record/RecordConfig';
import type { ReplayConfig, ReplayDatasetConfig } from '@/components/PageComponents/Robots/Replay/ReplayConfig';
import type { TrainingConfig } from '@/components/PageComponents/Robots/Training/TrainingConfig';
import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_OWNED_ROBOTS_CONFIG_KEY = 'owned-robots-config';
export const OWNED_ROBOTS_RECORD_CONFIG_KEY = (nickname: string) => [BASE_OWNED_ROBOTS_CONFIG_KEY, 'record', nickname];
export const OWNED_ROBOTS_REPLAY_CONFIG_KEY = (nickname: string) => [BASE_OWNED_ROBOTS_CONFIG_KEY, 'replay', nickname];
export const OWNED_ROBOTS_EVALUATE_CONFIG_KEY = (nickname: string) => [BASE_OWNED_ROBOTS_CONFIG_KEY, 'evaluate', nickname];
export const TRAINING_CONFIG_KEY = () => ['training-config'];

//---------------------------------------------------------------------------------------------------//
// Owned Robot Record Functions
//---------------------------------------------------------------------------------------------------//
export const getRecordConfig = (nickname: string) => queryClient.getQueryData(OWNED_ROBOTS_RECORD_CONFIG_KEY(nickname));
export const setRecordConfig = (nickname: string, config: RecordDatasetConfig) =>
    queryClient.setQueryData(OWNED_ROBOTS_RECORD_CONFIG_KEY(nickname), config);
export const useGetRecordConfig = (nickname: string) =>
    useQuery({
        queryKey: OWNED_ROBOTS_RECORD_CONFIG_KEY(nickname),
        queryFn: () => getRecordConfig(nickname) ?? defaultRecordDatasetConfig(nickname),
    });

const defaultRecordDatasetConfig = (nickname: string): RecordDatasetConfig => ({
    dataset: 'dataset',
    num_episodes: 10,
    episode_time_s: 30,
    reset_time_s: 1,
    task: 'Wave your hand',
});

//---------------------------------------------------------------------------------------------------//
// Owned Robot Replay Functions
//---------------------------------------------------------------------------------------------------//
export const getReplayConfig = (nickname: string) => queryClient.getQueryData(OWNED_ROBOTS_REPLAY_CONFIG_KEY(nickname));
export const setReplayConfig = (nickname: string, config: ReplayConfig) =>
    queryClient.setQueryData(OWNED_ROBOTS_REPLAY_CONFIG_KEY(nickname), config);
export const useGetReplayConfig = (nickname: string) =>
    useQuery({ queryKey: OWNED_ROBOTS_REPLAY_CONFIG_KEY(nickname), queryFn: () => getReplayConfig(nickname) ?? defaultReplayConfig() });

const defaultReplayConfig = (): ReplayDatasetConfig => ({
    dataset: 'dataset',
    episode_number: 0,
});

//---------------------------------------------------------------------------------------------------//
// Owned Robot Training Functions
//---------------------------------------------------------------------------------------------------//
export const getTrainingConfig = () => queryClient.getQueryData(TRAINING_CONFIG_KEY()) ?? defaultTrainingConfig();
export const setTrainingConfig = (config: TrainingConfig) => queryClient.setQueryData(TRAINING_CONFIG_KEY(), config);
export const useGetTrainingConfig = () =>
    useQuery({
        queryKey: TRAINING_CONFIG_KEY(),
        queryFn: () => getTrainingConfig() ?? defaultTrainingConfig(),
    });

export const defaultTrainingConfig = (): TrainingConfig => {
    return {
        repo_dir: 'local',
        dataset: 'dataset',
        model_name: 'act_model_1',
        policy_type: 'act',
        batch_size: 8,
        steps: 10000,
        distributed_training: 'disabled',
        num_gpus: 1,
    };
};

//---------------------------------------------------------------------------------------------------//
// Owned Robot Evaluate Functions
//---------------------------------------------------------------------------------------------------//
export const getEvaluateConfig = (nickname: string) => queryClient.getQueryData(OWNED_ROBOTS_EVALUATE_CONFIG_KEY(nickname));
export const setEvaluateConfig = (nickname: string, config: EvaluateConfig) =>
    queryClient.setQueryData(OWNED_ROBOTS_EVALUATE_CONFIG_KEY(nickname), config);
export const useGetEvaluateConfig = (nickname: string) =>
    useQuery({
        queryKey: OWNED_ROBOTS_EVALUATE_CONFIG_KEY(nickname),
        queryFn: () => getEvaluateConfig(nickname) ?? defaultEvaluateConfig(),
    });

const defaultEvaluateConfig = (): EvaluateDatasetConfig => ({
    dataset: 'dataset',
    num_episodes: 10,
    episode_time_s: 30,
    reset_time_s: 1,
    task: 'Wave your hand',
    model_name: 'act_model_1',
    model_steps: 10000,
});
