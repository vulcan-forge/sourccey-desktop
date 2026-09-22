import { invoke, isTauri } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';

export const KIOSK_UPDATE_KEY = ['kiosk', 'update-status'];
export const KIOSK_UPDATE_PROGRESS_KEY = ['kiosk', 'update-progress'];

export type KioskUpdateStatus = {
    updateAvailable: boolean;
    appUpdateAvailable: boolean;
    lerobotUpdateAvailable: boolean;
    appCurrent?: string | null;
    appRemote?: string | null;
    lerobotCurrent?: string | null;
    lerobotRemote?: string | null;
    error?: string | null;
};

export type KioskUpdateProgress = {
    running: boolean;
    action?: 'app' | 'modules' | null;
    step?: string | null;
    status?: string | null;
    percent: number;
    message?: string | null;
    error?: string | null;
    startedAt?: number | null;
    stepStartedAt?: number | null;
    log: string[];
};

const fetchKioskUpdateStatus = async (): Promise<KioskUpdateStatus> => {
    if (!isTauri()) {
        return {
            updateAvailable: false,
            appUpdateAvailable: false,
            lerobotUpdateAvailable: false,
        };
    }
    return await invoke<KioskUpdateStatus>('kiosk_update_check');
};

type KioskUpdateQueryOptions = Pick<UseQueryOptions<KioskUpdateStatus>, 'enabled'>;

export const useKioskUpdateStatus = (options?: KioskUpdateQueryOptions) =>
    useQuery({
        queryKey: KIOSK_UPDATE_KEY,
        queryFn: fetchKioskUpdateStatus,
        enabled: options?.enabled ?? true,
        staleTime: 60 * 60 * 1000,
        refetchInterval: 60 * 60 * 1000,
        refetchOnMount: true,
        refetchOnWindowFocus: false,
        retry: 1,
    });

const fetchKioskUpdateProgress = async (): Promise<KioskUpdateProgress> => {
    if (!isTauri()) {
        return { running: false, percent: 0, log: [] };
    }
    return await invoke<KioskUpdateProgress>('kiosk_update_progress');
};

export const useKioskUpdateProgress = () =>
    useQuery({
        queryKey: KIOSK_UPDATE_PROGRESS_KEY,
        queryFn: fetchKioskUpdateProgress,
        refetchInterval: 2_000,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        staleTime: 0,
    });
