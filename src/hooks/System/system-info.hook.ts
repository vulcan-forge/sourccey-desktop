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
    current_a: number;
    remaining_capacity_ah: number;
    max_capacity_ah: number;
    state_of_charge: number;
    max_error: number;
    error?: string | null;
}

export type BatteryLevelStep = 0 | 25 | 50 | 75 | 100;

const BATTERY_VOLTAGE_MIN = 11.5;
const BATTERY_VOLTAGE_MAX = 13.6;
const MAX_ERROR_VOLTAGE_FALLBACK_THRESHOLD = 80;

const clampBatteryPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const calculateVoltageScaledPercent = (voltage: number) => {
    const scaled = ((voltage - BATTERY_VOLTAGE_MIN) / (BATTERY_VOLTAGE_MAX - BATTERY_VOLTAGE_MIN)) * 100;
    return clampBatteryPercent(scaled);
};

export const calculateBatteryPercent = (batteryData: BatteryData): number => {
    const hasVoltage = Number.isFinite(batteryData.voltage) && batteryData.voltage >= 0;
    const hasSoc = Number.isFinite(batteryData.state_of_charge) && batteryData.state_of_charge >= 0;
    const hasMaxError = Number.isFinite(batteryData.max_error) && batteryData.max_error >= 0;

    if (hasMaxError && batteryData.max_error > MAX_ERROR_VOLTAGE_FALLBACK_THRESHOLD && hasVoltage) {
        return calculateVoltageScaledPercent(batteryData.voltage);
    }

    if (hasSoc) {
        return clampBatteryPercent(batteryData.state_of_charge);
    }

    if (hasVoltage) {
        return calculateVoltageScaledPercent(batteryData.voltage);
    }

    return -1;
};

export const getBatteryLevelStep = (percent: number): BatteryLevelStep => {
    if (!Number.isFinite(percent) || percent < 10) {
        return 0;
    }

    if (percent < 25) {
        return 25;
    }

    if (percent < 50) {
        return 50;
    }

    if (percent < 75) {
        return 75;
    }

    return 100;
};

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
        staleTime: 10000,
    });

const DEFAULT_BATTERY_DATA: BatteryData = {
    voltage: -1,
    current_a: -1,
    remaining_capacity_ah: -1,
    max_capacity_ah: -1,
    state_of_charge: -1,
    max_error: -1,
    error: null,
};

const DEFAULT_SYSTEM_INFO: SystemInfo = {
    ipAddress: '...',
    temperature: '...',
    batteryData: DEFAULT_BATTERY_DATA,
};

//---------------------------------------------------------------------------------------------------//
