import { queryClient } from '@/hooks/default';
import { invoke } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';

export const BASE_WIFI_KEY = 'wifi';

export const SAVED_WIFI_SSIDS_KEY = [BASE_WIFI_KEY, 'saved-ssids'];

const DEFAULT_SAVED_SSIDS: string[] = [];

export interface WiFiNetwork {
    ssid: string;
    signal_strength: number;
    security: string;
}

export const scanWiFiNetworks = () => invoke<WiFiNetwork[]>('scan_wifi_networks');

export const getCurrentWiFiConnection = () => invoke<WiFiNetwork | null>('get_current_wifi_connection');

export const connectToWiFi = (network: WiFiNetwork, password: string) =>
    invoke<string>('connect_to_wifi', {
        ssid: network.ssid,
        password,
        security: network.security,
    });

export const disconnectFromWiFi = () => invoke<string>('disconnect_from_wifi');

//---------------------------------------------------------------------------------------------------//
// Saved WiFi SSIDs Functions
//---------------------------------------------------------------------------------------------------//

export const getSavedWiFiSSIDs = (): string[] => {
    return (queryClient.getQueryData(SAVED_WIFI_SSIDS_KEY) as string[]) ?? DEFAULT_SAVED_SSIDS;
};

export const setSavedWiFiSSIDs = (ssids: string[]) => {
    queryClient.setQueryData(SAVED_WIFI_SSIDS_KEY, ssids);
};

export const addSavedWiFiSSID = (ssid: string) => {
    const ssids = getSavedWiFiSSIDs();
    if (ssids.includes(ssid)) {
        setSavedWiFiSSIDs([ssid, ...ssids.filter((s) => s !== ssid)]);
    } else {
        setSavedWiFiSSIDs([ssid, ...ssids]);
    }
};

export const useGetSavedWiFiSSIDs = () => {
    return useQuery({
        queryKey: SAVED_WIFI_SSIDS_KEY,
        queryFn: () => getSavedWiFiSSIDs(),
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
    });
};
