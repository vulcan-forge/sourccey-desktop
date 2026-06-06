'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    FaBatteryHalf,
    FaBatteryFull,
    FaBatteryQuarter,
    FaBatteryEmpty,
    FaThermometerHalf,
    FaNetworkWired,
    FaBatteryThreeQuarters,
    FaSpinner,
    FaCheckCircle,
    FaCloud,
} from 'react-icons/fa';
import {
    calculateBatteryPercent,
    getBatteryLevelStep,
    setSystemInfo,
    useGetSystemInfo,
    type BatteryData,
} from '@/hooks/System/system-info.hook';

interface KioskCloudPairingInfo {
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

export const HomeWelcome = () => {
    const nickname = 'sourccey';
    const robotType = 'Sourccey';
    const { data: systemInfo }: any = useGetSystemInfo();
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
            const info = await invoke<KioskCloudPairingInfo>('get_kiosk_cloud_pairing_info');
            setCloudPairing(info);
        } catch (error) {
            console.error('Failed to get cloud pairing info:', error);
            setCloudPairing({
                environment: 'local',
                portalBaseUrl: 'http://192.168.1.220:5200',
                apiBaseUrl: 'http://192.168.1.220:5200',
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

    useEffect(() => {
        void fetchSystemInfo();
        const interval = setInterval(() => {
            void fetchSystemInfo();
        }, 60000);
        return () => clearInterval(interval);
    }, [fetchSystemInfo]);


    useEffect(() => {
        const interval = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const getBatteryIcon = (percent: number) => {
        const level = getBatteryLevelStep(percent);
        if (level === 100) return FaBatteryFull;
        if (level === 75) return FaBatteryThreeQuarters;
        if (level === 50) return FaBatteryHalf;
        if (level === 25) return FaBatteryQuarter;
        return FaBatteryEmpty;
    };

    const getBatteryColor = (percent: number) => {
        if (percent > 75) return 'text-green-400';
        if (percent >= 10) return 'text-white';
        return 'text-red-400';
    };

    const batteryPercent = calculateBatteryPercent(systemInfo.batteryData);
    const BatteryIcon = getBatteryIcon(batteryPercent);
    const BatteryColor = getBatteryColor(batteryPercent);
    const batteryPercentString = batteryPercent >= 0 ? `${batteryPercent}%` : 'Off';

    const registrationActionLabel =
        cloudPairing?.status === 'claimed' ? 'Refresh Status' : cloudPairing?.pairingCode ? 'Refresh Code' : 'Start Registration';

    const cloudCountdown = useMemo(() => {
        if (!cloudPairing?.expiresAtMs) return null;
        const remainingMs = cloudPairing.expiresAtMs - nowMs;
        if (remainingMs <= 0) return 'Refreshing code…';
        const totalSeconds = Math.floor(remainingMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `Expires in ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, [cloudPairing?.expiresAtMs, nowMs]);

    return (
        <>
            <div className="flex flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-white">Welcome back!</h2>
                        <p className="mt-2 text-slate-300">Here&apos;s what&apos;s happening with {nickname} today.</p>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-slate-400">Robot Type</div>
                        <div className="text-xl font-bold text-white">{robotType}</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <BatteryIcon className={`h-4 w-4 ${BatteryColor}`} />
                                    Battery Life
                                </div>
                                <div className={`mt-2 text-3xl font-bold ${BatteryColor}`}>{batteryPercentString}</div>
                            </div>
                            <div className="text-right text-xs text-slate-500">
                                {batteryPercent >= 0 && <>{batteryPercent > 50 ? 'Good' : batteryPercent > 20 ? 'Low' : 'Critical'}</>}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <FaThermometerHalf className="h-4 w-4 text-orange-400" />
                                    Temperature
                                </div>
                                <div className="mt-2 text-3xl font-bold text-white">
                                    {systemInfo.temperature !== '...' ? systemInfo.temperature : 'N/A'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <FaNetworkWired className="h-4 w-4 text-blue-400" />
                                    IP Address
                                </div>
                                <div className="mt-2 font-mono text-lg font-bold text-white">
                                    {systemInfo.ipAddress &&
                                    systemInfo.ipAddress.trim() !== '' &&
                                    systemInfo.ipAddress.toLowerCase() !== 'unknown' &&
                                    systemInfo.ipAddress !== '...'
                                        ? systemInfo.ipAddress
                                        : 'Disconnected'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-xl font-semibold text-white">
                            <FaCloud className="h-5 w-5 text-sky-300" />
                            Register Robot
                        </div>
                        <p className="mt-1 text-sm text-slate-400">
                            Start cloud registration here, then enter the pairing code in the Vulcan portal to claim this robot.
                        </p>
                    </div>
                    <button
                        onClick={() => void fetchCloudPairing()}
                        className="cursor-pointer rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-400"
                    >
                        {registrationActionLabel}
                    </button>
                </div>

                <div className="mb-5 grid gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-sm text-slate-300 md:grid-cols-3">
                    <div>
                        <div className="font-semibold text-white">1. Start registration</div>
                        <div className="mt-1 text-slate-400">Generate a short-lived pairing code for this robot.</div>
                    </div>
                    <div>
                        <div className="font-semibold text-white">2. Sign in to Vulcan</div>
                        <div className="mt-1 text-slate-400">Open the portal and choose the robot registration flow.</div>
                    </div>
                    <div>
                        <div className="font-semibold text-white">3. Enter the code</div>
                        <div className="mt-1 text-slate-400">Once claimed, this kiosk will show that the robot is registered.</div>
                    </div>
                </div>

                {!cloudPairing && !isLoadingCloudPairing ? (
                    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-sm text-slate-300">
                        Click <span className="font-semibold text-white">Start Registration</span> to generate a pairing code for this robot.
                    </div>
                ) : isLoadingCloudPairing && !cloudPairing ? (
                    <div className="flex items-center gap-2 text-slate-300">
                        <FaSpinner className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Loading cloud pairing…</span>
                    </div>
                ) : cloudPairing?.status === 'claimed' ? (
                    <div className="space-y-3">
                        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-300">
                            <FaCheckCircle className="h-4 w-4" />
                            Registered in Vulcan Cloud
                        </div>
                        <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                            <div>
                                <div className="text-slate-400">Device ID</div>
                                <div className="font-mono text-xs text-white">{cloudPairing.deviceId || 'Unavailable'}</div>
                            </div>
                            <div>
                                <div className="text-slate-400">Owned Robot ID</div>
                                <div className="font-mono text-xs text-white">{cloudPairing.ownedRobotId || 'Pending sync'}</div>
                            </div>
                            <div>
                                <div className="text-slate-400">Robot Model</div>
                                <div className="text-white">{cloudPairing.robotModelName}</div>
                            </div>
                            <div>
                                <div className="text-slate-400">Cloud Host</div>
                                <div className="text-white">{cloudPairing.portalBaseUrl}</div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1 text-sm font-semibold text-sky-200">
                            <FaCloud className="h-4 w-4" />
                            Registration in progress
                        </div>
                        <div className="text-sm text-slate-300">
                            Open <span className="font-semibold text-white">{cloudPairing?.portalBaseUrl || 'http://192.168.1.220:5200'}</span>,
                            sign in, and enter this pairing code.
                        </div>
                        <div className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-5 text-center font-mono text-4xl font-bold tracking-[0.18em] text-white">
                            {cloudPairing?.pairingCode || '------'}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                            <span>{cloudCountdown || 'Waiting for a fresh code…'}</span>
                            <span>Model: {cloudPairing?.robotModelName || 'sourccey'}</span>
                            <span className="font-mono text-xs">Device: {cloudPairing?.deviceId || 'Generating…'}</span>
                        </div>
                        {cloudPairing?.errorMessage ? (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                                {cloudPairing.errorMessage}
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        </>
    );
};


