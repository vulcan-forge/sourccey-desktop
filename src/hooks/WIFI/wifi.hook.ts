// import { queryClient } from '@/hooks/default';
// import { useQuery } from '@tanstack/react-query';

// export const BASE_WIFI_KEY = 'wifi';

// export const WIFI_SSID_KEY = [BASE_WIFI_KEY, 'ssid'];
// export const WIFI_PASSWORD_KEY = [BASE_WIFI_KEY, 'password'];

// export const DEFAULT_WIFI_SSID = 'sourccey';
// export const DEFAULT_WIFI_PASSWORD = 'vulcan-1234567890';

// //---------------------------------------------------------------------------------------------------//
// // WiFi SSID Functions
// //---------------------------------------------------------------------------------------------------//
// export const getWifiSSID = () => queryClient.getQueryData(WIFI_SSID_KEY) ?? DEFAULT_WIFI_SSID;
// export const setWifiSSID = (content: any) => queryClient.setQueryData(WIFI_SSID_KEY, content);
// export const useGetWifiSSID = () => useQuery({ queryKey: WIFI_SSID_KEY, queryFn: () => getWifiSSID() ?? DEFAULT_WIFI_SSID });

// export const getWifiPassword = () => queryClient.getQueryData(WIFI_PASSWORD_KEY) ?? DEFAULT_WIFI_PASSWORD;
// export const setWifiPassword = (content: any) => queryClient.setQueryData(WIFI_PASSWORD_KEY, content);
// export const useGetWifiPassword = () => useQuery({ queryKey: WIFI_PASSWORD_KEY, queryFn: () => getWifiPassword() ?? DEFAULT_WIFI_PASSWORD });
// //---------------------------------------------------------------------------------------------------//
