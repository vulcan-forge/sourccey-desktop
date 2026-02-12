import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const PAIRED_ROBOT_CONNECTIONS_KEY = ['paired-robot-connections'];

export type PairedRobotConnection = {
    nickname: string;
    host: string;
    port: number;
    token: string;
    robotType: string;
    robotName: string;
    pairedAt: number;
};

type PairedRobotConnectionMap = Record<string, PairedRobotConnection>;

export const getPairedRobotConnections = () =>
    queryClient.getQueryData<PairedRobotConnectionMap>(PAIRED_ROBOT_CONNECTIONS_KEY) ?? {};

export const setPairedRobotConnection = (nickname: string, connection: PairedRobotConnection) => {
    const current = getPairedRobotConnections();
    queryClient.setQueryData(PAIRED_ROBOT_CONNECTIONS_KEY, {
        ...current,
        [nickname]: connection,
    });
};

export const usePairedRobotConnections = () =>
    useQuery({
        queryKey: PAIRED_ROBOT_CONNECTIONS_KEY,
        queryFn: () => getPairedRobotConnections(),
        staleTime: Infinity,
        gcTime: Infinity,
    });
