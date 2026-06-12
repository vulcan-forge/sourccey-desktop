import { invoke, isTauri } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';

export const KIOSK_UPDATE_KEY = ['kiosk', 'update-status'];

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
