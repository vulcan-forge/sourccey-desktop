import { invoke, isTauri } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/hooks/default';
import type { KioskEnvironmentSettings, SaveKioskEnvironmentSettingsRequest } from '@/types/kiosk-environment';

export const KIOSK_ENVIRONMENT_KEY = ['kiosk', 'environment-settings'];

const defaultEnvironmentSettings: KioskEnvironmentSettings = {
    environment: 'production',
    displayName: 'Production',
    badgeLabel: null,
    customAppBaseUrl: 'https://studio.vulcanrobotics.ai',
    customApiBaseUrl: 'https://api.studio.vulcanrobotics.ai',
    appBaseUrl: 'https://studio.vulcanrobotics.ai',
    apiBaseUrl: 'https://api.studio.vulcanrobotics.ai',
};

const fetchKioskEnvironmentSettings = async (): Promise<KioskEnvironmentSettings> => {
    if (!isTauri()) {
        return defaultEnvironmentSettings;
    }

    return await invoke<KioskEnvironmentSettings>('get_kiosk_environment_settings');
};

export const useKioskEnvironmentSettings = () =>
    useQuery({
        queryKey: KIOSK_ENVIRONMENT_KEY,
        queryFn: fetchKioskEnvironmentSettings,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
    });

export const saveKioskEnvironmentSettings = async (
    settings: SaveKioskEnvironmentSettingsRequest
): Promise<KioskEnvironmentSettings> => {
    const saved = await invoke<KioskEnvironmentSettings>('save_kiosk_environment_settings', { settings });
    queryClient.setQueryData(KIOSK_ENVIRONMENT_KEY, saved);
    return saved;
};
