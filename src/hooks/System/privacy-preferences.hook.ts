import { invoke, isTauri } from '@tauri-apps/api/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/hooks/default';
import type { PrivacyPreferences, SavePrivacyPreferencesRequest } from '@/types/privacy-preferences';
import {
    completePrivacyPreferences,
    CURRENT_ONBOARDING_VERSION,
    parseStoredPrivacyPreferences,
} from '@/settings/privacy-preferences';

export const PRIVACY_PREFERENCES_KEY = ['settings', 'privacy-preferences'];
export { CURRENT_ONBOARDING_VERSION };
const BROWSER_STORAGE_KEY = 'vulcan.privacy-preferences.v1';

const readBrowserPreferences = (): PrivacyPreferences => {
    if (typeof window === 'undefined') return parseStoredPrivacyPreferences(null);
    const stored = window.localStorage.getItem(BROWSER_STORAGE_KEY);
    return parseStoredPrivacyPreferences(stored);
};

export const getPrivacyPreferences = async (): Promise<PrivacyPreferences> => {
    if (!isTauri()) return readBrowserPreferences();
    return await invoke<PrivacyPreferences>('get_privacy_preferences');
};

export const savePrivacyPreferences = async (
    preferences: SavePrivacyPreferencesRequest
): Promise<PrivacyPreferences> => {
    let saved: PrivacyPreferences;
    if (isTauri()) {
        saved = await invoke<PrivacyPreferences>('save_privacy_preferences', { preferences });
    } else {
        const now = new Date().toISOString();
        saved = completePrivacyPreferences(readBrowserPreferences(), preferences, now);
        window.localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(saved));
    }

    queryClient.setQueryData(PRIVACY_PREFERENCES_KEY, saved);
    return saved;
};

export const usePrivacyPreferences = () =>
    useQuery({
        queryKey: PRIVACY_PREFERENCES_KEY,
        queryFn: getPrivacyPreferences,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
    });

export const useSavePrivacyPreferences = () =>
    useMutation({
        mutationFn: savePrivacyPreferences,
        onSuccess: (saved) => queryClient.setQueryData(PRIVACY_PREFERENCES_KEY, saved),
    });
