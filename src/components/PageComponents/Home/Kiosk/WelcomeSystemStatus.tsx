'use client';

import {
    FaBatteryEmpty,
    FaBatteryFull,
    FaBatteryHalf,
    FaBatteryQuarter,
    FaBatteryThreeQuarters,
    FaNetworkWired,
    FaThermometerHalf,
} from 'react-icons/fa';
import { calculateBatteryPercent, getBatteryLevelStep } from '@/hooks/System/system-info.hook';
import type { WelcomeSystemInfo } from './welcome.types';

interface WelcomeSystemStatusProps {
    nickname: string;
    robotType: string;
    systemInfo: WelcomeSystemInfo;
    isLoadingSystemInfo?: boolean;
}

const LoadingLine = ({ className = '' }: { className?: string }) => (
    <div className={`skeleton-shimmer rounded-full ${className}`} />
);

export const WelcomeSystemStatus = ({
    nickname,
    robotType,
    systemInfo,
    isLoadingSystemInfo = false,
}: WelcomeSystemStatusProps) => {
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
    const BatteryIcon = isLoadingSystemInfo ? FaBatteryFull : getBatteryIcon(batteryPercent);
    const batteryColor = isLoadingSystemInfo ? 'text-white' : getBatteryColor(batteryPercent);
    const batteryPercentString = batteryPercent >= 0 ? `${batteryPercent}%` : 'Off';

    return (
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
                                <BatteryIcon className={`h-4 w-4 ${batteryColor}`} />
                                Battery Life
                            </div>
                            {isLoadingSystemInfo ? (
                                <LoadingLine className="mt-3 h-9 w-24" />
                            ) : (
                                <div className={`mt-2 text-3xl font-bold ${batteryColor}`}>{batteryPercentString}</div>
                            )}
                        </div>
                        <div className="text-right text-xs text-slate-500">
                            {isLoadingSystemInfo ? (
                                <LoadingLine className="h-4 w-12" />
                            ) : (
                                batteryPercent >= 0 && <>{batteryPercent > 50 ? 'Good' : batteryPercent > 20 ? 'Low' : 'Critical'}</>
                            )}
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
                            {isLoadingSystemInfo ? (
                                <LoadingLine className="mt-3 h-9 w-28" />
                            ) : (
                                <div className="mt-2 text-3xl font-bold text-white">
                                    {systemInfo.temperature !== '...' ? systemInfo.temperature : 'N/A'}
                                </div>
                            )}
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
                            {isLoadingSystemInfo ? (
                                <LoadingLine className="mt-3 h-7 w-36" />
                            ) : (
                                <div className="mt-2 font-mono text-lg font-bold text-white">
                                    {systemInfo.ipAddress &&
                                    systemInfo.ipAddress.trim() !== '' &&
                                    systemInfo.ipAddress.toLowerCase() !== 'unknown' &&
                                    systemInfo.ipAddress !== '...'
                                        ? systemInfo.ipAddress
                                        : 'Disconnected'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
