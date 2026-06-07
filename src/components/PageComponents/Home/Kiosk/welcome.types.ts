import type { BatteryData } from '@/hooks/System/system-info.hook';

export interface KioskCloudPairingInfo {
    environment: string;
    portalBaseUrl: string;
    apiBaseUrl: string;
    deviceId: string;
    robotModelName: string;
    pairingCode: string | null;
    expiresAtMs: number | null;
    status: string;
    ownedRobotId: string | null;
    claimedAtMs: number | null;
    errorMessage: string | null;
}

export interface WelcomeSystemInfo {
    ipAddress: string;
    temperature: string;
    batteryData: BatteryData;
}

export const DEFAULT_PRODUCTION_PORTAL_BASE_URL = 'https://studio.vulcanrobotics.ai';
export const DEFAULT_PRODUCTION_API_BASE_URL = 'https://api.studio.vulcanrobotics.ai';
