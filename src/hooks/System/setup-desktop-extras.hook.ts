import { invoke, isTauri } from '@tauri-apps/api/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/hooks/default';

export type DesktopExtrasStatus = {
    installed: boolean;
    missing: string[];
};

export type BaseSetupStatus = {
    installed: boolean;
    missing: string[];
};

export const DESKTOP_EXTRAS_KEY = ['setup', 'desktop-extras'];

export const formatSetupInvokeError = (error: unknown): string => {
    if (typeof error === 'string') {
        return error;
    }
    if (error instanceof Error) {
        return error.message;
    }
    if (error && typeof error === 'object') {
        const maybeMessage =
            'message' in error && typeof error.message === 'string'
                ? error.message
                : 'error' in error && typeof error.error === 'string'
                  ? error.error
                  : null;
        if (maybeMessage) {
            return maybeMessage;
        }
        try {
            return JSON.stringify(error, null, 2);
        } catch {
            return 'Unknown setup error.';
        }
    }
    return 'Unknown setup error.';
};

export const getDesktopExtrasCachedStatus = () =>
    queryClient.getQueryData<DesktopExtrasStatus | null>(DESKTOP_EXTRAS_KEY) ?? null;

export const setDesktopExtrasCachedStatus = (status: DesktopExtrasStatus) =>
    queryClient.setQueryData(DESKTOP_EXTRAS_KEY, status);

export const getDesktopExtrasStatus = async (): Promise<DesktopExtrasStatus> => {
    if (!isTauri()) {
        return { installed: true, missing: [] };
    }
    const cached = getDesktopExtrasCachedStatus();
    if (cached?.installed === true) {
        return cached;
    }
    const status = await invoke<DesktopExtrasStatus>('setup_desktop_extras_check');
    setDesktopExtrasCachedStatus(status);
    return status;
};

export const runDesktopExtrasSetup = async (): Promise<void> => {
    if (!isTauri()) return;
    try {
        const baseStatus = await invoke<BaseSetupStatus>('setup_check');
        if (!baseStatus.installed) {
            await invoke('setup_run', { force: false });
        }
        await invoke('setup_desktop_extras_run');
        setDesktopExtrasCachedStatus({ installed: true, missing: [] });
    } catch (error) {
        throw new Error(formatSetupInvokeError(error));
    }
};

export const getLerobotVulcanDir = async (): Promise<string | null> => {
    if (!isTauri()) return null;
    return await invoke<string>('get_lerobot_vulcan_dir');
};

export const useDesktopExtrasStatus = () =>
    useQuery({
        queryKey: DESKTOP_EXTRAS_KEY,
        queryFn: getDesktopExtrasStatus,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });

export const useInstallDesktopExtras = () =>
    useMutation({
        mutationFn: runDesktopExtrasSetup,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: DESKTOP_EXTRAS_KEY });
        },
    });

export const useGetLerobotVulcanDir = () =>
    useQuery({
        queryKey: ['setup', 'lerobot-vulcan-dir'],
        queryFn: getLerobotVulcanDir,
        staleTime: 60000,
    });
