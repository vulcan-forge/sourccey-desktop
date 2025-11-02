import type { RemoteConfig } from '@/components/PageComponents/OwnedRobots/RemoteRobotConfig';
import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_REMOTE_CONTROLLED_ROBOTS_CONFIG_KEY = 'remote-controlled-robots-config';
export const REMOTE_CONTROLLED_ROBOT_CONFIG_KEY = (nickname: string) => [BASE_REMOTE_CONTROLLED_ROBOTS_CONFIG_KEY, 'control', nickname];
export const ALL_REMOTE_CONTROLLED_ROBOTS_CONFIG_KEY = [BASE_REMOTE_CONTROLLED_ROBOTS_CONFIG_KEY, 'all-control'];

//---------------------------------------------------------------------------------------------------//
// Robot Control
//---------------------------------------------------------------------------------------------------//

export enum RemoteControlType {
    CONNECT = 'connect',
    STARTED = 'started',
    TELEOP = 'teleop',
    RECORD = 'record',
    REPLAY = 'replay',
    TRAINING = 'training',
    EVALUATE = 'evaluate',
}

export const getRemoteControlledRobot = (nickname: string | null) =>
    queryClient.getQueryData(REMOTE_CONTROLLED_ROBOT_CONFIG_KEY(nickname ?? '')) ?? null;

export const setRemoteControlledRobot = (nickname: string | null, controlType: RemoteControlType, controlledRobot: any) => {
    queryClient.setQueryData(REMOTE_CONTROLLED_ROBOT_CONFIG_KEY(nickname ?? ''), { controlType, controlledRobot });
    queryClient.setQueryData(ALL_REMOTE_CONTROLLED_ROBOTS_CONFIG_KEY, {
        ...getRemoteControlledRobots(),
        [nickname ?? '']: { controlType, controlledRobot },
    });
};

export const useGetRemoteControlledRobot = (nickname: string | null) =>
    useQuery({ queryKey: REMOTE_CONTROLLED_ROBOT_CONFIG_KEY(nickname ?? ''), queryFn: () => getRemoteControlledRobot(nickname) });

//---------------------------------------------------------------------------------------------------//
// All Control Robots
//---------------------------------------------------------------------------------------------------//
export const getRemoteControlledRobots = () => queryClient.getQueryData(ALL_REMOTE_CONTROLLED_ROBOTS_CONFIG_KEY) ?? {};
export const useGetRemoteControlledRobots = () =>
    useQuery({ queryKey: ALL_REMOTE_CONTROLLED_ROBOTS_CONFIG_KEY, queryFn: () => getRemoteControlledRobots() });
