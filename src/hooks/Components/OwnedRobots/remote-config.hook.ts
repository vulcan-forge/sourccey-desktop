import type { RemoteEvaluateDatasetConfig } from '@/components/PageComponents/OwnedRobots/Evaluate/RemoteEvaluateConfig';
import type { RemoteRecordDatasetConfig } from '@/components/PageComponents/OwnedRobots/Record/RemoteRecordConfig';
import type { RemoteReplayDatasetConfig } from '@/components/PageComponents/OwnedRobots/Replay/RemoteReplayConfig';
import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_REMOTE_ROBOTS_CONFIG_KEY = 'remote-robots-config';
export const REMOTE_ROBOT_CONNECT_KEY = (nickname: string) => [BASE_REMOTE_ROBOTS_CONFIG_KEY, 'connect', nickname];
export const REMOTE_ROBOT_START_KEY = (nickname: string) => [BASE_REMOTE_ROBOTS_CONFIG_KEY, 'start', nickname];
export const REMOTE_ROBOT_RECORD_KEY = (nickname: string) => [BASE_REMOTE_ROBOTS_CONFIG_KEY, 'record', nickname];
export const REMOTE_ROBOT_REPLAY_KEY = (nickname: string) => [BASE_REMOTE_ROBOTS_CONFIG_KEY, 'replay', nickname];
export const REMOTE_ROBOT_EVALUATE_KEY = (nickname: string) => [BASE_REMOTE_ROBOTS_CONFIG_KEY, 'evaluate', nickname];

//---------------------------------------------------------------------------------------------------//
// Remote Robot Config Functions
//---------------------------------------------------------------------------------------------------//
export enum RemoteRobotConnectState {
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    DISCONNECTING = 'disconnecting',
    DISCONNECTED = 'disconnected',
    ERROR = 'error',
}

export const getRemoteRobotConnect = (nickname: string) =>
    queryClient.getQueryData(REMOTE_ROBOT_CONNECT_KEY(nickname) ?? RemoteRobotConnectState.DISCONNECTED);
export const setRemoteRobotConnect = (nickname: string, state: RemoteRobotConnectState) =>
    queryClient.setQueryData(REMOTE_ROBOT_CONNECT_KEY(nickname), state);
export const useGetRemoteRobotConnect = (nickname: string) =>
    useQuery({
        queryKey: REMOTE_ROBOT_CONNECT_KEY(nickname),
        queryFn: () => getRemoteRobotConnect(nickname) ?? RemoteRobotConnectState.DISCONNECTED,
    });

//---------------------------------------------------------------------------------------------------//
// Remote Robot Started Functions
//---------------------------------------------------------------------------------------------------//
export enum RemoteRobotStartedState {
    STARTING = 'starting',
    STARTED = 'started',
    STOPPING = 'stopping',
    STOPPED = 'stopped',
    ERROR = 'error',
}

export const getRemoteRobotStart = (nickname: string) => queryClient.getQueryData(REMOTE_ROBOT_START_KEY(nickname) ?? false);
export const setRemoteRobotStart = (nickname: string, state: RemoteRobotStartedState) => {
    console.log('setRemoteRobotStart', nickname, state);
    queryClient.setQueryData(REMOTE_ROBOT_START_KEY(nickname), state);
};

export const useGetRemoteRobotStart = (nickname: string) =>
    useQuery({
        queryKey: REMOTE_ROBOT_START_KEY(nickname),
        queryFn: () => getRemoteRobotStart(nickname) ?? RemoteRobotStartedState.STOPPED,
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
