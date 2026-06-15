import { invoke, isTauri } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/hooks/default';
import {
    DESKTOP_ENVIRONMENT_KEY,
    getDefaultDesktopEnvironmentSettings,
    resolveClientDesktopEnvironmentSettings,
    setDesktopEnvironmentSettings,
} from '@/environments/environment';
import type {
    DesktopEnvironmentSettings,
    SaveDesktopEnvironmentSettingsRequest,
} from '@/types/desktop-environment';

const fetchDesktopEnvironmentSettings = async (): Promise<DesktopEnvironmentSettings> => {
    if (!isTauri()) {
        return setDesktopEnvironmentSettings(getDefaultDesktopEnvironmentSettings());
    }

    const settings = await invoke<DesktopEnvironmentSettings>('get_desktop_environment_settings');
    return setDesktopEnvironmentSettings(settings);
};

export const useDesktopEnvironmentSettings = () =>
    useQuery({
        queryKey: DESKTOP_ENVIRONMENT_KEY,
        queryFn: fetchDesktopEnvironmentSettings,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
    });

export const saveDesktopEnvironmentSettings = async (
    settings: SaveDesktopEnvironmentSettingsRequest
): Promise<DesktopEnvironmentSettings> => {
    const saved = isTauri()
        ? await invoke<DesktopEnvironmentSettings>('save_desktop_environment_settings', { settings })
        : resolveClientDesktopEnvironmentSettings(settings);
    setDesktopEnvironmentSettings(saved);
    queryClient.setQueryData(DESKTOP_ENVIRONMENT_KEY, saved);
    return saved;
};
