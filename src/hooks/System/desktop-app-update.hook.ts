import { invoke, isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { useQuery } from '@tanstack/react-query';

export const DESKTOP_APP_UPDATE_KEY = ['desktop', 'app-update-status'];

export interface DesktopAppUpdateStatus {
    updateAvailable: boolean;
    currentVersion?: string | null;
    targetVersion?: string | null;
    releaseNotes?: string | null;
    parityPassed: boolean;
    force: boolean;
    error?: string | null;
}

const toErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    if (typeof error === 'string' && error.trim().length > 0) {
        return error;
    }
    return 'Unknown desktop update check error';
};

const emptyUpdateStatus = (currentVersion: string | null, error: string | null): DesktopAppUpdateStatus => ({
    updateAvailable: false,
    currentVersion,
    targetVersion: null,
    releaseNotes: null,
    parityPassed: true,
    force: false,
    error,
});

const fetchDesktopAppUpdateStatus = async (): Promise<DesktopAppUpdateStatus> => {
    if (!isTauri()) {
        return emptyUpdateStatus(null, null);
    }

    try {
        return await invoke<DesktopAppUpdateStatus>('desktop_update_check');
    } catch (error) {
        let currentVersion: string | null = null;
        try {
            currentVersion = await getVersion();
        } catch {
            currentVersion = null;
        }
        return emptyUpdateStatus(currentVersion, toErrorMessage(error));
    }
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
