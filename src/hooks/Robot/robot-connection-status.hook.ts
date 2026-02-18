import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const ROBOT_CONNECTION_STATUS_KEY = ['robot-connection-status'];

export type RobotConnectionStatus = {
    connected: boolean;
    started?: boolean;
    checkedAt: number;
    message?: string;
};

type RobotConnectionStatusMap = Record<string, RobotConnectionStatus>;

export const getRobotConnectionStatuses = () =>
    queryClient.getQueryData<RobotConnectionStatusMap>(ROBOT_CONNECTION_STATUS_KEY) ?? {};

export const setRobotConnectionStatus = (nickname: string, status: RobotConnectionStatus) => {
    const current = getRobotConnectionStatuses();
    queryClient.setQueryData(ROBOT_CONNECTION_STATUS_KEY, {
        ...current,
        [nickname]: status,
    });
};

export const removeRobotConnectionStatus = (nickname: string) => {
    const current = getRobotConnectionStatuses();
    const next = { ...current };
    delete next[nickname];
    queryClient.setQueryData(ROBOT_CONNECTION_STATUS_KEY, next);
};

export const useRobotConnectionStatuses = () =>
    useQuery({
        queryKey: ROBOT_CONNECTION_STATUS_KEY,
        queryFn: () => getRobotConnectionStatuses(),
        staleTime: Infinity,
        gcTime: Infinity,
    });
