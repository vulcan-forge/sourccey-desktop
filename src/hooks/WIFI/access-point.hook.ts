import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

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

//---------------------------------------------------------------------------------------------------//
// Access Point SSID Functions
//---------------------------------------------------------------------------------------------------//

export const isAccessPointEnabled = async (): Promise<boolean> => {
    const isActive = (await invoke('is_access_point_active')) as boolean;
    return isActive;
};
export const setAccessPointEnabled = (content: any) => queryClient.setQueryData(ACCESS_POINT_ENABLED_KEY, content);
export const useGetAccessPointEnabled = () => useQuery({ queryKey: ACCESS_POINT_ENABLED_KEY, queryFn: isAccessPointEnabled });

export const getAccessPointSSID = () => queryClient.getQueryData(ACCESS_POINT_SSID_KEY) ?? DEFAULT_ACCESS_POINT_SSID;
export const setAccessPointSSID = (content: any) => queryClient.setQueryData(ACCESS_POINT_SSID_KEY, content);
export const useGetAccessPointSSID = () =>
    useQuery({ queryKey: ACCESS_POINT_SSID_KEY, queryFn: () => getAccessPointSSID() ?? DEFAULT_ACCESS_POINT_SSID });

export const getAccessPointPassword = () => queryClient.getQueryData(ACCESS_POINT_PASSWORD_KEY) ?? DEFAULT_ACCESS_POINT_PASSWORD;
export const setAccessPointPassword = (content: any) => queryClient.setQueryData(ACCESS_POINT_PASSWORD_KEY, content);
export const useGetAccessPointPassword = () =>
    useQuery({ queryKey: ACCESS_POINT_PASSWORD_KEY, queryFn: () => getAccessPointPassword() ?? DEFAULT_ACCESS_POINT_PASSWORD });
//---------------------------------------------------------------------------------------------------//
