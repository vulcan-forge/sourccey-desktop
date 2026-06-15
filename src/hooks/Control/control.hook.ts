import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_CONTROLLED_ROBOTS_CONFIG_KEY = 'controlled-robots-config';
export const CONTROLLED_ROBOT_CONFIG_KEY = (nickname: string) => [BASE_CONTROLLED_ROBOTS_CONFIG_KEY, 'control', nickname];
export const ALL_CONTROLLED_ROBOTS_CONFIG_KEY = [BASE_CONTROLLED_ROBOTS_CONFIG_KEY, 'all-control'];

export enum ControlType {
    TELEOP = 'teleop',
    RECORDING = 'recording',
    ROLLOUT = 'rollout',
    AIMODEL = 'ai model',
}

//---------------------------------------------------------------------------------------------------//
// Robot Control
//---------------------------------------------------------------------------------------------------//
export const getControlledRobot = (nickname: string | null) => queryClient.getQueryData(CONTROLLED_ROBOT_CONFIG_KEY(nickname ?? '')) ?? null;

export const setControlledRobot = (nickname: string | null, controlType: ControlType, ownedRobot: any) => {
    queryClient.setQueryData(CONTROLLED_ROBOT_CONFIG_KEY(nickname ?? ''), { controlType, ownedRobot });
    queryClient.setQueryData(ALL_CONTROLLED_ROBOTS_CONFIG_KEY, { ...getControlledRobots(), [nickname ?? '']: { controlType, ownedRobot } });
};

export const clearControlledRobot = (nickname: string | null) => {
    const key = nickname ?? '';
    queryClient.setQueryData(CONTROLLED_ROBOT_CONFIG_KEY(key), null);
    const allControlled: Record<string, any> = { ...getControlledRobots() };
    allControlled[key] = null;
    queryClient.setQueryData(ALL_CONTROLLED_ROBOTS_CONFIG_KEY, allControlled);
};

export const useGetControlledRobot = (nickname: string | null) =>
    useQuery({ queryKey: CONTROLLED_ROBOT_CONFIG_KEY(nickname ?? ''), queryFn: () => getControlledRobot(nickname) });

//---------------------------------------------------------------------------------------------------//
// All Control Robots
//---------------------------------------------------------------------------------------------------//
export const getControlledRobots = () => queryClient.getQueryData(ALL_CONTROLLED_ROBOTS_CONFIG_KEY) ?? {};
export const useGetControlledRobots = () => useQuery({ queryKey: ALL_CONTROLLED_ROBOTS_CONFIG_KEY, queryFn: () => getControlledRobots() });
