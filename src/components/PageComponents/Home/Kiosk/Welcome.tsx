'use client';

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { setSystemInfo, useGetSystemInfo, type BatteryData } from '@/hooks/System/system-info.hook';
import { WelcomeRegistrationSection } from './WelcomeRegistrationSection';
import { WelcomeSystemStatus } from './WelcomeSystemStatus';
import {
    DEFAULT_PRODUCTION_API_BASE_URL,
    DEFAULT_PRODUCTION_PORTAL_BASE_URL,
    type KioskCloudPairingInfo,
    type WelcomeSystemInfo,
} from './welcome.types';

export const HomeWelcome = () => {
    const nickname = 'sourccey';
    const robotType = 'Sourccey';
    const { data } = useGetSystemInfo();
    const systemInfo = (data as WelcomeSystemInfo | undefined) ?? {
        ipAddress: '...',
        temperature: '...',
        batteryData: {} as BatteryData,
    };
    const [cloudPairing, setCloudPairing] = useState<KioskCloudPairingInfo | null>(null);
    const [isLoadingCloudPairing, setIsLoadingCloudPairing] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());

    const fetchSystemInfo = useCallback(async () => {
        try {
            const info = await invoke<{ ip_address: string; temperature: string; battery_data: BatteryData }>('get_system_info');
            const nextSystemInfo = {
                ipAddress: info.ip_address,
                temperature: info.temperature,
                batteryData: info.battery_data,
            };
            setSystemInfo(nextSystemInfo);
        } catch (error) {
            console.error('Failed to get system info:', error);
        }
    }, []);

    const fetchCloudPairing = useCallback(async () => {
        setIsLoadingCloudPairing(true);
        try {
            const info = await invoke<KioskCloudPairingInfo>('get_kiosk_cloud_pairing_status');
            setCloudPairing(info);
        } catch (error) {
            console.error('Failed to get cloud pairing info:', error);
            setCloudPairing({
                environment: 'production',
                portalBaseUrl: DEFAULT_PRODUCTION_PORTAL_BASE_URL,
                apiBaseUrl: DEFAULT_PRODUCTION_API_BASE_URL,
                deviceId: '',
                robotModelName: 'sourccey',
                pairingCode: null,
                expiresAtMs: null,
                status: 'error',
                ownedRobotId: null,
                claimedAtMs: null,
                errorMessage: error instanceof Error ? error.message : 'Unable to load cloud pairing info',
            });
        } finally {
            setIsLoadingCloudPairing(false);
        }
    }, []);

    const startOrRefreshCloudPairing = useCallback(async () => {
        setIsLoadingCloudPairing(true);
        try {
            const commandName = cloudPairing?.status === 'claimed' ? 'get_kiosk_cloud_pairing_status' : 'get_kiosk_cloud_pairing_info';
            const info = await invoke<KioskCloudPairingInfo>(commandName);
            setCloudPairing(info);
        } catch (error) {
            console.error('Failed to start or refresh cloud pairing:', error);
            setCloudPairing({
                environment: 'production',
                portalBaseUrl: DEFAULT_PRODUCTION_PORTAL_BASE_URL,
                apiBaseUrl: DEFAULT_PRODUCTION_API_BASE_URL,
                deviceId: '',
                robotModelName: 'sourccey',
                pairingCode: null,
                expiresAtMs: null,
                status: 'error',
                ownedRobotId: null,
                claimedAtMs: null,
                errorMessage: error instanceof Error ? error.message : 'Unable to load cloud pairing info',
            });
        } finally {
            setIsLoadingCloudPairing(false);
        }
    }, [cloudPairing?.status]);

    useEffect(() => {
        void fetchSystemInfo();
        const interval = setInterval(() => {
            void fetchSystemInfo();
        }, 60000);
        return () => clearInterval(interval);
    }, [fetchSystemInfo]);

    useEffect(() => {
        void fetchCloudPairing();
    }, [fetchCloudPairing]);

    useEffect(() => {
        const interval = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <>
            <WelcomeSystemStatus nickname={nickname} robotType={robotType} systemInfo={systemInfo} />
            <WelcomeRegistrationSection
                cloudPairing={cloudPairing}
                isLoadingCloudPairing={isLoadingCloudPairing}
                nowMs={nowMs}
                onRefresh={() => void startOrRefreshCloudPairing()}
            />
        </>
    );
};
