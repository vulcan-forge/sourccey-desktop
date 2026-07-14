'use client';

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FaExclamationTriangle } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { hasLoadedSystemInfo, useGetSystemInfo, type BatteryData } from '@/hooks/System/system-info.hook';
import { toastWarningDefaults } from '@/utils/toast/toast-utils';
import { WelcomeRegistrationSection } from './WelcomeRegistrationSection';
import { WelcomeSystemStatus } from './WelcomeSystemStatus';
import {
    DEFAULT_PRODUCTION_API_BASE_URL,
    DEFAULT_PRODUCTION_PORTAL_BASE_URL,
    type KioskCloudPairingInfo,
    type WelcomeSystemInfo,
} from './welcome.types';

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return fallback;
};

export const HomeWelcome = () => {
    const nickname = 'sourccey';
    const robotType = 'Sourccey';
    const { data } = useGetSystemInfo();
    const systemInfo = (data as WelcomeSystemInfo | undefined) ?? {
        ipAddress: '...',
        temperature: '...',
        batteryData: {} as BatteryData,
    };
    const isSystemInfoLoading = !hasLoadedSystemInfo(systemInfo);
    const [cloudPairing, setCloudPairing] = useState<KioskCloudPairingInfo | null>(null);
    const [isLoadingCloudPairing, setIsLoadingCloudPairing] = useState(true);
    const [nowMs, setNowMs] = useState(() => Date.now());

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
            const errorMessage = getErrorMessage(error, 'Unable to contact the registration API');
            const apiBaseUrl = cloudPairing?.apiBaseUrl || DEFAULT_PRODUCTION_API_BASE_URL;
            setCloudPairing((current) =>
                current
                    ? { ...current, status: 'error', errorMessage }
                    : {
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
                          errorMessage,
                      }
            );
            toast.warning(
                <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold">
                        <FaExclamationTriangle className="h-4 w-4 text-amber-300" />
                        Registration API unavailable
                    </div>
                    <div className="text-sm text-slate-200">
                        Could not start registration through <span className="font-semibold text-white">{apiBaseUrl}</span>. Confirm the API is
                        running and check the kiosk developer settings.
                    </div>
                    <div className="text-xs text-slate-400">{errorMessage}</div>
                </div>,
                { ...toastWarningDefaults, autoClose: 7000 }
            );
        } finally {
            setIsLoadingCloudPairing(false);
        }
    }, [cloudPairing?.apiBaseUrl, cloudPairing?.status]);

    useEffect(() => {
        void fetchCloudPairing();
    }, [fetchCloudPairing]);

    useEffect(() => {
        const interval = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <>
            <WelcomeSystemStatus nickname={nickname} robotType={robotType} systemInfo={systemInfo} isLoadingSystemInfo={isSystemInfoLoading} />
            <WelcomeRegistrationSection
                cloudPairing={cloudPairing}
                isLoadingCloudPairing={isLoadingCloudPairing}
                nowMs={nowMs}
                onRefresh={() => void startOrRefreshCloudPairing()}
            />
        </>
    );
};
