import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';
import { invoke, isTauri } from '@tauri-apps/api/core';

// Generate 6 random alphanumeric characters for GUID
const generateGuidSuffix = (): string => {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
};

export const BASE_ACCESS_POINT_KEY = 'access-point';

export const ACCESS_POINT_ENABLED_KEY = [BASE_ACCESS_POINT_KEY, 'enabled'];
export const ACCESS_POINT_SSID_KEY = [BASE_ACCESS_POINT_KEY, 'ssid'];
export const ACCESS_POINT_PASSWORD_KEY = [BASE_ACCESS_POINT_KEY, 'password'];

export const DEFAULT_ACCESS_POINT_ENABLED = false;
export const DEFAULT_ACCESS_POINT_SSID = 'sourccey';
export const DEFAULT_ACCESS_POINT_PASSWORD = `vulcan-${generateGuidSuffix()}`;

type AccessPointCredentials = {
    ssid: string;
    password: string;
};

const loadAccessPointCredentials = async (): Promise<AccessPointCredentials | null> => {
    if (!isTauri()) return null;
    try {
        return await invoke<AccessPointCredentials | null>('get_access_point_credentials');
    } catch (error) {
        console.error('Failed to load saved access point credentials:', error);
        return null;
    }
};

const hydrateAccessPointCredentials = async (): Promise<AccessPointCredentials | null> => {
    const cachedSSID = queryClient.getQueryData<string>(ACCESS_POINT_SSID_KEY);
    const cachedPassword = queryClient.getQueryData<string>(ACCESS_POINT_PASSWORD_KEY);
    const hasCachedSSID = typeof cachedSSID === 'string' && cachedSSID.length > 0;
    const hasCachedPassword = typeof cachedPassword === 'string' && cachedPassword.length > 0;

    if (hasCachedSSID && hasCachedPassword) {
        return { ssid: cachedSSID!, password: cachedPassword! };
    }

    const saved = await loadAccessPointCredentials();
    if (saved?.ssid && saved?.password) {
        queryClient.setQueryData(ACCESS_POINT_SSID_KEY, saved.ssid);
        queryClient.setQueryData(ACCESS_POINT_PASSWORD_KEY, saved.password);
        return saved;
    }

    return null;
};

export const saveAccessPointCredentials = async (ssid: string, password: string) => {
    const nextSSID = ssid.trim();
    if (isTauri()) {
        await invoke('save_access_point_credentials', {
            ssid: nextSSID,
            password,
        });
    }
    queryClient.setQueryData(ACCESS_POINT_SSID_KEY, nextSSID);
    queryClient.setQueryData(ACCESS_POINT_PASSWORD_KEY, password);
};

//---------------------------------------------------------------------------------------------------//
// Access Point SSID Functions
//---------------------------------------------------------------------------------------------------//

export const isAccessPointEnabled = async (): Promise<boolean> => {
    try {
        const isActive = (await invoke('is_access_point_active')) as boolean;
        return isActive ?? false;
    } catch (error) {
        console.error('Failed to check if access point is active:', error);
        return false;
    }
};
export const setAccessPointEnabled = (content: any) => queryClient.setQueryData(ACCESS_POINT_ENABLED_KEY, content);
export const useGetAccessPointEnabled = () => useQuery({ queryKey: ACCESS_POINT_ENABLED_KEY, queryFn: isAccessPointEnabled });

export const getAccessPointSSID = () => queryClient.getQueryData(ACCESS_POINT_SSID_KEY) ?? DEFAULT_ACCESS_POINT_SSID;
export const setAccessPointSSID = (content: any) => queryClient.setQueryData(ACCESS_POINT_SSID_KEY, content);
export const useGetAccessPointSSID = () =>
    useQuery({
        queryKey: ACCESS_POINT_SSID_KEY,
        queryFn: async () => {
            const hydrated = await hydrateAccessPointCredentials();
            return (getAccessPointSSID() ?? hydrated?.ssid ?? DEFAULT_ACCESS_POINT_SSID) as string;
        },
    });

export const getAccessPointPassword = () => queryClient.getQueryData(ACCESS_POINT_PASSWORD_KEY) ?? DEFAULT_ACCESS_POINT_PASSWORD;
export const setAccessPointPassword = (content: any) => queryClient.setQueryData(ACCESS_POINT_PASSWORD_KEY, content);
export const useGetAccessPointPassword = () =>
    useQuery({
        queryKey: ACCESS_POINT_PASSWORD_KEY,
        queryFn: async () => {
            const hydrated = await hydrateAccessPointCredentials();
            return (getAccessPointPassword() ?? hydrated?.password ?? DEFAULT_ACCESS_POINT_PASSWORD) as string;
        },
    });
//---------------------------------------------------------------------------------------------------//
