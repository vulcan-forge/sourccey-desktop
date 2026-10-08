'use client';

import { useState } from 'react';

import {
    FaBatteryEmpty,
    FaBatteryFull,
    FaBatteryHalf,
    FaBatteryQuarter,
    FaBatteryThreeQuarters,
    FaBolt,
    FaNetworkWired,
    FaThermometerHalf,
    FaChevronRight,
} from 'react-icons/fa';
import { calculateBatteryPercent, getBatteryLevelStep, isBatteryCharging } from '@/hooks/System/system-info.hook';
import type { WelcomeSystemInfo } from './welcome.types';
import { BatteryModal } from '@/components/Elements/Modals/KioskRobotModals/BatteryModal';
import { TemperatureModal } from '@/components/Elements/Modals/KioskRobotModals/TemperatureModal';
import { WiFiModal } from '@/components/Elements/Modals/KioskRobotModals/WiFiModal';
import { WelcomeHardwareStatus } from './WelcomeHardwareStatus';

interface WelcomeSystemStatusProps {
    nickname: string;
    robotType: string;
    systemInfo: WelcomeSystemInfo;
    isLoadingSystemInfo?: boolean;
}

const LoadingLine = ({ className = '' }: { className?: string }) => <div className={`skeleton-shimmer rounded-full ${className}`} />;

export const WelcomeSystemStatus = ({ nickname, robotType, systemInfo, isLoadingSystemInfo = false }: WelcomeSystemStatusProps) => {
    const [activeModal, setActiveModal] = useState<'battery' | 'temperature' | 'network' | null>(null);
    const getBatteryIcon = (percent: number) => {
        const level = getBatteryLevelStep(percent);
        if (level === 100) return FaBatteryFull;
        if (level === 75) return FaBatteryThreeQuarters;
        if (level === 50) return FaBatteryHalf;
        if (level === 25) return FaBatteryQuarter;
        return FaBatteryEmpty;
    };

    const getBatteryColor = (percent: number) => {
        if (percent > 75) return 'text-emerald-300';
        if (percent >= 10) return 'text-white';
        return 'text-red-300';
    };

    const batteryPercent = calculateBatteryPercent(systemInfo.batteryData);
    const batteryIsCharging = isBatteryCharging(systemInfo.batteryData);
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
                <button
                    type="button"
                    onClick={() => setActiveModal('battery')}
                    className="group cursor-pointer rounded-xl border border-slate-600/80 bg-slate-800/50 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400/50 hover:bg-slate-700/70 hover:shadow-lg focus:ring-2 focus:ring-emerald-400/50 focus:outline-none"
                    aria-label="Open battery details"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                                <span className="relative inline-flex">
                                    <BatteryIcon className={`h-4 w-4 ${batteryColor}`} />
                                    {!isLoadingSystemInfo && batteryIsCharging ? (
                                        <FaBolt className="absolute -top-1 -right-1 h-2.5 w-2.5 text-amber-300" />
                                    ) : null}
                                </span>
                                Battery Life
                            </div>
                            {isLoadingSystemInfo ? (
                                <LoadingLine className="mt-3 h-9 w-24" />
                            ) : (
                                <div className={`mt-2 text-3xl font-bold ${batteryColor}`}>{batteryPercentString}</div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-right text-xs text-slate-500">
                            {isLoadingSystemInfo ? (
                                <LoadingLine className="h-4 w-12" />
                            ) : (
                                batteryPercent >= 0 && <>{batteryPercent > 50 ? 'Good' : batteryPercent > 20 ? 'Low' : 'Critical'}</>
                            )}
                            <FaChevronRight className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-emerald-300" />
                        </div>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveModal('temperature')}
                    className="group cursor-pointer rounded-xl border border-slate-600/80 bg-slate-800/50 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-400/50 hover:bg-slate-700/70 hover:shadow-lg focus:ring-2 focus:ring-orange-400/50 focus:outline-none"
                    aria-label="Open temperature and cooling details"
                >
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
                        <FaChevronRight className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-orange-300" />
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveModal('network')}
                    className="group cursor-pointer rounded-xl border border-slate-600/80 bg-slate-800/50 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400/50 hover:bg-slate-700/70 hover:shadow-lg focus:ring-2 focus:ring-blue-400/50 focus:outline-none"
                    aria-label="Open network details"
                >
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
                        <FaChevronRight className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-blue-300" />
                    </div>
                </button>
            </div>

            <WelcomeHardwareStatus />

            <BatteryModal
                isOpen={activeModal === 'battery'}
                onClose={() => setActiveModal(null)}
                batteryData={systemInfo.batteryData}
            />
            <TemperatureModal
                isOpen={activeModal === 'temperature'}
                onClose={() => setActiveModal(null)}
                thermalData={systemInfo.thermalData}
            />
            <WiFiModal isOpen={activeModal === 'network'} onClose={() => setActiveModal(null)} systemInfo={systemInfo} />
        </div>
    );
};
