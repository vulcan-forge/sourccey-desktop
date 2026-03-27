import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';
import { invoke, isTauri } from '@tauri-apps/api/core';

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

const normalizeNickname = (nickname: string) => nickname.trim().replace(/^@+/, '');

const loadSavedPairedRobotConnections = async (): Promise<PairedRobotConnectionMap> => {
    if (!isTauri()) return {};
    try {
        return (await invoke<PairedRobotConnectionMap>('get_saved_paired_robot_connections')) ?? {};
    } catch (error) {
        console.error('Failed to load saved paired robot connections:', error);
        return {};
    }
};

export const hydratePairedRobotConnections = async (): Promise<PairedRobotConnectionMap> => {
    const cached = getPairedRobotConnections();
    if (Object.keys(cached).length > 0) {
        return cached;
    }

    const saved = await loadSavedPairedRobotConnections();
    if (Object.keys(saved).length > 0) {
        queryClient.setQueryData(PAIRED_ROBOT_CONNECTIONS_KEY, saved);
    }
    return saved;
};

export const getPairedRobotConnections = () =>
    queryClient.getQueryData<PairedRobotConnectionMap>(PAIRED_ROBOT_CONNECTIONS_KEY) ?? {};

export const setPairedRobotConnection = (nickname: string, connection: PairedRobotConnection) => {
    const normalizedNickname = normalizeNickname(nickname);
    const normalizedConnection: PairedRobotConnection = {
        ...connection,
        nickname: normalizedNickname,
    };
    const current = getPairedRobotConnections();
    queryClient.setQueryData(PAIRED_ROBOT_CONNECTIONS_KEY, {
        ...current,
        [normalizedNickname]: normalizedConnection,
    });
    if (isTauri()) {
        void invoke('upsert_paired_robot_connection', {
            nickname: normalizedNickname,
            connection: normalizedConnection,
        }).catch((error) => {
            console.error('Failed to persist paired robot connection:', error);
        });
    }
};

export const removePairedRobotConnection = (nickname: string) => {
    const normalizedNickname = normalizeNickname(nickname);
    const current = getPairedRobotConnections();
    const next = { ...current };
    delete next[normalizedNickname];
    queryClient.setQueryData(PAIRED_ROBOT_CONNECTIONS_KEY, next);
    if (isTauri()) {
        void invoke('remove_paired_robot_connection', { nickname: normalizedNickname }).catch((error) => {
            console.error('Failed to remove paired robot connection:', error);
        });
    }
};

export const usePairedRobotConnections = () =>
    useQuery({
        queryKey: PAIRED_ROBOT_CONNECTIONS_KEY,
        queryFn: async () => {
            const hydrated = await hydratePairedRobotConnections();
            return Object.keys(hydrated).length > 0 ? hydrated : getPairedRobotConnections();
        },
        staleTime: Infinity,
        gcTime: Infinity,
    });
