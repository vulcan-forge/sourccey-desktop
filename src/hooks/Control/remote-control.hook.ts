import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_REMOTE_ROBOT_STATE_CONFIG_KEY = 'remote-robot-state-config';
export const REMOTE_ROBOT_STATE_CONFIG_KEY = (nickname: string) => [BASE_REMOTE_ROBOT_STATE_CONFIG_KEY, 'state', nickname];
export const ALL_REMOTE_ROBOT_STATE_CONFIG_KEY = [BASE_REMOTE_ROBOT_STATE_CONFIG_KEY, 'all-state'];

export interface RemoteRobotState {
    status: RemoteRobotStatus;
    controlType: RemoteControlType;
    controlledRobot: any;
}

export enum RemoteRobotStatus {
    NONE = 'none',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    DISCONNECTING = 'disconnecting',
    STARTING = 'starting',
    STARTED = 'started',
    STOPPING = 'stopping',
}

export enum RemoteControlType {
    NONE = 'none',
    TELEOP = 'teleop',
    RECORD = 'record',
    REPLAY = 'replay',
    TRAINING = 'training',
    EVALUATE = 'evaluate',
}

export const getRemoteRobotState = (nickname: string | null): RemoteRobotState =>
    queryClient.getQueryData(REMOTE_ROBOT_STATE_CONFIG_KEY(nickname ?? '')) ?? {
        status: RemoteRobotStatus.NONE,
        controlType: RemoteControlType.NONE,
        controlledRobot: null,
    };

export const setRemoteRobotState = (
    nickname: string | null,
    status: RemoteRobotStatus | null,
    controlType: RemoteControlType | null = null,
    controlledRobot: any
) => {
    const currentRemoteRobotState = getRemoteRobotState(nickname);
    const remoteRobotState = {
        ...currentRemoteRobotState,
        ...(status !== null && { status }),
        ...(controlType !== null && { controlType }),
        ...(controlledRobot !== null && { controlledRobot }),
    };

    queryClient.setQueryData(REMOTE_ROBOT_STATE_CONFIG_KEY(nickname ?? ''), remoteRobotState);
    queryClient.setQueryData(ALL_REMOTE_ROBOT_STATE_CONFIG_KEY, {
        ...getRemoteRobotsState(),
        [nickname ?? '']: remoteRobotState,
    });
};

export const useGetRemoteRobotState = (nickname: string | null) =>
    useQuery({ queryKey: REMOTE_ROBOT_STATE_CONFIG_KEY(nickname ?? ''), queryFn: () => getRemoteRobotState(nickname) });

//---------------------------------------------------------------------------------------------------//
// All Control Robots
//---------------------------------------------------------------------------------------------------//
export const getRemoteRobotsState = () => queryClient.getQueryData(ALL_REMOTE_ROBOT_STATE_CONFIG_KEY) ?? {};
export const useGetRemoteRobotsState = () => useQuery({ queryKey: ALL_REMOTE_ROBOT_STATE_CONFIG_KEY, queryFn: () => getRemoteRobotsState() });
