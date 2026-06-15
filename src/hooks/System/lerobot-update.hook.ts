import { invoke, isTauri } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';

export const LEROBOT_UPDATE_KEY = ['lerobot', 'update-status'];

export type LerobotReleaseState = 'up_to_date' | 'update_available' | 'custom_build' | 'unknown';

export interface LerobotUpdateStatus {
    state: LerobotReleaseState;
    upToDate: boolean;
    currentCommit?: string | null;
    latestCommit?: string | null;
    currentTag?: string | null;
    latestTag?: string | null;
    message?: string | null;
}

const fetchLerobotUpdateStatus = async (): Promise<LerobotUpdateStatus> => {
    if (!isTauri()) {
        return { state: 'up_to_date', upToDate: true };
    }
    return await invoke<LerobotUpdateStatus>('check_lerobot_update');
};

export const useLerobotUpdateStatus = () =>
    useQuery({
        queryKey: LEROBOT_UPDATE_KEY,
        queryFn: fetchLerobotUpdateStatus,
        staleTime: 60000,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        retry: 1,
    });
