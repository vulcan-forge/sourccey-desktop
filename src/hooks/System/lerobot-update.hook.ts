import { invoke, isTauri } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';

export const LEROBOT_UPDATE_KEY = ['lerobot', 'update-status'];

export interface LerobotUpdateStatus {
    upToDate: boolean;
    currentCommit?: string | null;
    latestCommit?: string | null;
}

const fetchLerobotUpdateStatus = async (): Promise<LerobotUpdateStatus> => {
    if (!isTauri()) {
        return { upToDate: true };
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
