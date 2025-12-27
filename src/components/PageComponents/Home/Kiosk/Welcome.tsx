'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FaBatteryHalf, FaBatteryFull, FaBatteryQuarter, FaBatteryEmpty, FaThermometerHalf, FaNetworkWired } from 'react-icons/fa';
import type { BatteryData } from '@/app/app/settings/page';

export const HomeWelcome = () => {
    const nickname = 'sourccey';
    const robotType = 'Sourccey';

    // State for system info (battery, temperature, IP)
    const [systemInfo, setSystemInfo] = useState({
        ipAddress: '...',
        temperature: '...',
        batteryData: {
            voltage: -1,
            percent: -1,
        },
    });

    // Fetch system info periodically
    useEffect(() => {
        const fetchSystemInfo = async () => {
            try {
                const info = await invoke<{ ip_address: string; temperature: string; battery_data: BatteryData }>('get_system_info');
                setSystemInfo({
                    ipAddress: info.ip_address,
                    temperature: info.temperature,
                    batteryData: info.battery_data,
                });
            } catch (error) {
                console.error('Failed to get system info:', error);
            }
        };

        fetchSystemInfo();
        const interval = setInterval(fetchSystemInfo, 60000); // Update every 60 seconds
        return () => clearInterval(interval);
    }, []);

    // Get battery icon based on percentage
    const getBatteryIcon = () => {
        const percent = systemInfo.batteryData.percent;
        if (percent < 0) return FaBatteryEmpty;
        if (percent >= 75) return FaBatteryFull;
        if (percent >= 50) return FaBatteryHalf;
        if (percent >= 25) return FaBatteryQuarter;
        return FaBatteryEmpty;
    };

    const getBatteryColor = () => {
        const percent = systemInfo.batteryData.percent;
        if (percent < 0) return 'text-slate-500';
        if (percent >= 50) return 'text-green-400';
        if (percent >= 20) return 'text-yellow-400';
        return 'text-red-400';
    };

    const BatteryIcon = getBatteryIcon();
    return (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            {/* Header */}
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

            {/* Battery Life Card */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                                <BatteryIcon className={`h-4 w-4 ${getBatteryColor()}`} />
                                Battery Life
                            </div>
                            <div className={`mt-2 text-3xl font-bold ${getBatteryColor()}`}>
                                {systemInfo.batteryData.percent >= 0 ? `${systemInfo.batteryData.percent}%` : 'N/A'}
                            </div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                            {systemInfo.batteryData.percent >= 0 && (
                                <>{systemInfo.batteryData.percent > 50 ? 'Good' : systemInfo.batteryData.percent > 20 ? 'Low' : 'Critical'}</>
                            )}
                        </div>
                    </div>
                </div>

                {/* System Temperature */}
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

                {/* Network Info */}
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                                <FaNetworkWired className="h-4 w-4 text-blue-400" />
                                IP Address
                            </div>
                            <div className="mt-2 font-mono text-lg font-bold text-white">
                                {systemInfo.ipAddress && systemInfo.ipAddress.trim() !== '' && systemInfo.ipAddress.toLowerCase() !== 'unknown' && systemInfo.ipAddress !== '...'
                                    ? systemInfo.ipAddress
                                    : 'Disconnected'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
