import type { RemoteEvaluateDatasetConfig } from '@/components/PageComponents/Robots/Evaluate/RemoteEvaluateConfig';
import type { RemoteRecordDatasetConfig } from '@/components/PageComponents/Robots/Record/RemoteRecordConfig';
import type { RemoteReplayDatasetConfig } from '@/components/PageComponents/Robots/Replay/RemoteReplayConfig';
import type { RemoteTeleopConfig } from '@/components/PageComponents/Robots/Teleop/RemoteTeleopAction';
import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_REMOTE_ROBOTS_CONFIG_KEY = 'remote-robots-config';
export const REMOTE_ROBOT_TELEOP_KEY = (nickname: string) => [BASE_REMOTE_ROBOTS_CONFIG_KEY, 'teleop', nickname];
export const REMOTE_ROBOT_RECORD_KEY = (nickname: string) => [BASE_REMOTE_ROBOTS_CONFIG_KEY, 'record', nickname];
export const REMOTE_ROBOT_REPLAY_KEY = (nickname: string) => [BASE_REMOTE_ROBOTS_CONFIG_KEY, 'replay', nickname];
export const REMOTE_ROBOT_EVALUATE_KEY = (nickname: string) => [BASE_REMOTE_ROBOTS_CONFIG_KEY, 'evaluate', nickname];

//---------------------------------------------------------------------------------------------------//
// Remote Robot Teleop Functions
//---------------------------------------------------------------------------------------------------//
export const getRemoteTeleopConfig = (nickname: string) => queryClient.getQueryData(REMOTE_ROBOT_TELEOP_KEY(nickname));
export const setRemoteTeleopConfig = (nickname: string, config: RemoteTeleopConfig) =>
    queryClient.setQueryData(REMOTE_ROBOT_TELEOP_KEY(nickname), config);
export const useGetRemoteTeleopConfig = (nickname: string) =>
    useQuery({
        queryKey: REMOTE_ROBOT_TELEOP_KEY(nickname),
        queryFn: () => getRemoteTeleopConfig(nickname) ?? defaultRemoteTeleopConfig(),
    });

const defaultRemoteTeleopConfig = (): RemoteTeleopConfig => ({
    nickname: 'sourccey',
    remote_ip: '192.168.1.225',
    left_arm_port: 'COM3',
    right_arm_port: 'COM8',
    keyboard: 'keyboard',
    fps: 30,
});
//---------------------------------------------------------------------------------------------------//
// Remote Robot Record Functions
//---------------------------------------------------------------------------------------------------//
export const getRemoteRecordConfig = (nickname: string) => queryClient.getQueryData(REMOTE_ROBOT_RECORD_KEY(nickname));
export const setRemoteRecordConfig = (nickname: string, config: RemoteRecordDatasetConfig) =>
    queryClient.setQueryData(REMOTE_ROBOT_RECORD_KEY(nickname), config);
export const useGetRemoteRecordConfig = (nickname: string) =>
    useQuery({
        queryKey: REMOTE_ROBOT_RECORD_KEY(nickname),
        queryFn: () => getRemoteRecordConfig(nickname) ?? defaultRemoteRecordDatasetConfig(),
    });

const defaultRemoteRecordDatasetConfig = (): RemoteRecordDatasetConfig => ({
    dataset: 'dataset',
    num_episodes: 10,
    episode_time_s: 30,
    reset_time_s: 1,
    task: 'Wave your hand',
    fps: 30,
});

//---------------------------------------------------------------------------------------------------//
// Remote Robot Replay Functions
//---------------------------------------------------------------------------------------------------//
export const getRemoteReplayConfig = (nickname: string) => queryClient.getQueryData(REMOTE_ROBOT_REPLAY_KEY(nickname));
export const setRemoteReplayConfig = (nickname: string, config: RemoteReplayDatasetConfig) =>
    queryClient.setQueryData(REMOTE_ROBOT_REPLAY_KEY(nickname), config);
export const useGetRemoteReplayConfig = (nickname: string) =>
    useQuery({
        queryKey: REMOTE_ROBOT_REPLAY_KEY(nickname),
        queryFn: () => getRemoteReplayConfig(nickname) ?? defaultRemoteReplayDatasetConfig(),
    });

const defaultRemoteReplayDatasetConfig = (): RemoteReplayDatasetConfig => ({
    dataset: 'dataset',
    episode: 0,
    fps: 30,
});

//---------------------------------------------------------------------------------------------------//
// Remote Robot Evaluate Functions
//---------------------------------------------------------------------------------------------------//
export const getRemoteEvaluateConfig = (nickname: string) => queryClient.getQueryData(REMOTE_ROBOT_EVALUATE_KEY(nickname));
export const setRemoteEvaluateConfig = (nickname: string, config: RemoteEvaluateDatasetConfig) =>
    queryClient.setQueryData(REMOTE_ROBOT_EVALUATE_KEY(nickname), config);
export const useGetRemoteEvaluateConfig = (nickname: string) =>
    useQuery({
        queryKey: REMOTE_ROBOT_EVALUATE_KEY(nickname),
        queryFn: () => getRemoteEvaluateConfig(nickname) ?? defaultRemoteEvaluateConfig(),
    });

const defaultRemoteEvaluateConfig = (): RemoteEvaluateDatasetConfig => ({
    dataset: 'dataset',
    num_episodes: 10,
    episode_time_s: 30,
    reset_time_s: 1,
    task: 'Wave your hand',
    fps: 30,
    model_name: 'act_model_1',
    model_steps: 10000,
});
