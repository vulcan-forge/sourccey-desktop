import { invoke, isTauri } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';

export const DESKTOP_APP_UPDATE_KEY = ['desktop', 'app-update-status'];

export interface DesktopAppUpdateStatus {
    updateAvailable: boolean;
    currentVersion?: string | null;
    targetVersion?: string | null;
    releaseNotes?: string | null;
    parityPassed: boolean;
    force: boolean;
}

const fetchDesktopAppUpdateStatus = async (): Promise<DesktopAppUpdateStatus> => {
    if (!isTauri()) {
        return {
            updateAvailable: false,
            currentVersion: null,
            targetVersion: null,
            releaseNotes: null,
            parityPassed: false,
            force: false,
        };
    }

    return await invoke<DesktopAppUpdateStatus>('desktop_update_check');
};

export const useDesktopAppUpdateStatus = () =>
    useQuery({
        queryKey: DESKTOP_APP_UPDATE_KEY,
        queryFn: fetchDesktopAppUpdateStatus,
        staleTime: 30 * 60 * 1000,
        refetchInterval: 30 * 60 * 1000,
        refetchOnMount: true,
        refetchOnWindowFocus: false,
        retry: 1,
    });
