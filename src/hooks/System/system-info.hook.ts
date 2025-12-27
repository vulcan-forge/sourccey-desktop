import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_SYSTEM_INFO_KEY = 'system-info';

export const SYSTEM_INFO_KEY = [BASE_SYSTEM_INFO_KEY, 'data'];

export interface SystemInfo {
    ipAddress: string;
    temperature: string;
    batteryData: BatteryData;
}

export interface BatteryData {
    voltage: number;
    percent: number;
    charging: boolean;
}

//---------------------------------------------------------------------------------------------------//
// System Info Functions
//---------------------------------------------------------------------------------------------------//
export const getSystemInfo = () => queryClient.getQueryData(SYSTEM_INFO_KEY) ?? DEFAULT_SYSTEM_INFO;
export const setSystemInfo = (content: SystemInfo) => queryClient.setQueryData(SYSTEM_INFO_KEY, content);
export const useGetSystemInfo = () =>
    useQuery({ 
        queryKey: SYSTEM_INFO_KEY, 
        queryFn: () => getSystemInfo() ?? DEFAULT_SYSTEM_INFO,
        initialData: DEFAULT_SYSTEM_INFO,
        staleTime: 5000,
    });

const DEFAULT_BATTERY_DATA: BatteryData = {
    voltage: -1,
    percent: -1,
    charging: false,
};

const DEFAULT_SYSTEM_INFO: SystemInfo = {
    ipAddress: '...',
    temperature: '...',
    batteryData: DEFAULT_BATTERY_DATA,
};

//---------------------------------------------------------------------------------------------------//
