import { invoke, isTauri } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';

export const DESKTOP_SETUP_PROGRESS_KEY = ['desktop', 'setup-progress'];

export type DesktopSetupProgress = {
    running: boolean;
    action?: 'repair' | 'update' | null;
    step?: string | null;
    status?: string | null;
    percent: number;
    message?: string | null;
    error?: string | null;
    startedAt?: number | null;
    stepStartedAt?: number | null;
    log: string[];
};

const fetchDesktopSetupProgress = async (): Promise<DesktopSetupProgress> => {
    if (!isTauri()) return { running: false, percent: 0, log: [] };
    return await invoke<DesktopSetupProgress>('desktop_setup_progress');
};

export const useDesktopSetupProgress = () =>
    useQuery({
        queryKey: DESKTOP_SETUP_PROGRESS_KEY,
        queryFn: fetchDesktopSetupProgress,
        refetchInterval: 2_000,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        staleTime: 0,
    });
