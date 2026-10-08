import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';
import { invoke, isTauri } from '@tauri-apps/api/core';

export const BASE_ACCESS_POINT_KEY = 'access-point';

export const ACCESS_POINT_STATUS_KEY = [BASE_ACCESS_POINT_KEY, 'status'];
export const ACCESS_POINT_SSID_KEY = [BASE_ACCESS_POINT_KEY, 'ssid'];
export const ACCESS_POINT_PASSWORD_KEY = [BASE_ACCESS_POINT_KEY, 'password'];
export const ACCESS_POINT_CREDENTIALS_KEY = [BASE_ACCESS_POINT_KEY, 'credentials'];

export const DEFAULT_ACCESS_POINT_SSID = 'sourccey';

export type AccessPointCredentials = {
    ssid: string;
    password: string;
};

export type AccessPointStatus = {
    active: boolean;
    ssid: string | null;
    ip_address: string | null;
    interface: string | null;
};

export type WiFiModeResult = {
    reconnected: boolean;
    message: string;
};

export const useGetAccessPointStatus = (enabled = true) =>
    useQuery<AccessPointStatus>({
        queryKey: ACCESS_POINT_STATUS_KEY,
        queryFn: () => invoke<AccessPointStatus>('get_access_point_status'),
        enabled: enabled && isTauri(),
        staleTime: 0,
        refetchOnMount: 'always',
        refetchInterval: 5000,
        retry: false,
    });

// Load both fields atomically. Read errors must not silently generate replacement
// credentials. This query is never persisted in browser storage.
export const useGetAccessPointCredentials = () =>
    useQuery<AccessPointCredentials | null>({
        queryKey: ACCESS_POINT_CREDENTIALS_KEY,
        queryFn: () => invoke<AccessPointCredentials | null>('get_access_point_credentials'),
        enabled: isTauri(),
        staleTime: 0,
        refetchOnMount: 'always',
        retry: false,
    });

export const cacheAccessPointCredentials = (ssid: string, password: string) =>
    queryClient.setQueryData(ACCESS_POINT_CREDENTIALS_KEY, { ssid, password });

export const saveAccessPointCredentials = async (ssid: string, password: string) => {
    await invoke('save_access_point_credentials', { ssid, password });
    cacheAccessPointCredentials(ssid, password);
};

export const refreshAccessPointStatus = () => queryClient.invalidateQueries({ queryKey: ACCESS_POINT_STATUS_KEY });
