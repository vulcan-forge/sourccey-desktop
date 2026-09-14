import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
    FaWifi,
    FaBatteryFull,
    FaBatteryHalf,
    FaBatteryQuarter,
    FaBatteryEmpty,
    FaBatteryThreeQuarters,
    FaBolt,
    FaSyncAlt,
} from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { WiFiModal } from '@/components/Elements/Modals/KioskRobotModals/WiFiModal';
import { BatteryModal } from '@/components/Elements/Modals/KioskRobotModals/BatteryModal';
import {
    calculateBatteryPercent,
    getBatteryLevelStep,
    hasLoadedSystemInfo,
    isBatteryCharging,
    setSystemInfo,
    useGetSystemInfo,
    type BatteryData,
} from '@/hooks/System/system-info.hook';
import { LinkButton } from '@/components/Elements/Link/LinkButton';
import { useKioskUpdateStatus } from '@/hooks/System/kiosk-update.hook';
import { useDesktopAppUpdateStatus } from '@/hooks/System/desktop-app-update.hook';

export const KioskTopNavbar = () => {
    const [shouldCheckUpdates, setShouldCheckUpdates] = useState(false);
    const [isWiFiModalOpen, setIsWiFiModalOpen] = useState(false);
    const [isBatteryModalOpen, setIsBatteryModalOpen] = useState(false);

    const { data: systemInfo } = useGetSystemInfo();
    const { data: kioskUpdateStatus } = useKioskUpdateStatus({ enabled: shouldCheckUpdates });
    const { data: desktopAppUpdateStatus } = useDesktopAppUpdateStatus({ enabled: shouldCheckUpdates });
    const hasConfirmedUpdate = Boolean(kioskUpdateStatus?.lerobotUpdateAvailable || desktopAppUpdateStatus?.updateAvailable);
    const isSystemInfoLoading = !hasLoadedSystemInfo(systemInfo);

    useEffect(() => {
        const fetchSystemInfo = async () => {
            try {
                const info = await invoke<{ ip_address: string; temperature: string; battery_data: BatteryData }>('get_system_info');
                const systemInfo = {
                    ipAddress: info.ip_address,
                    temperature: info.temperature,
                    batteryData: info.battery_data,
                };
                setSystemInfo(systemInfo);
            } catch (error) {
                console.error('Failed to get system info:', error);
            }
        };

        fetchSystemInfo();
        const interval = setInterval(fetchSystemInfo, 10000); // Update every 10 seconds
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let idleId: number | undefined;

        const enableChecks = () => setShouldCheckUpdates(true);

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            idleId = window.requestIdleCallback(() => {
                timeoutId = setTimeout(enableChecks, 250);
            });
        } else {
            timeoutId = setTimeout(enableChecks, 750);
        }

        return () => {
            if (idleId !== undefined && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
                window.cancelIdleCallback(idleId);
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, []);

    const getBatteryStyles = (percent: number) => {
        if (percent > 75) {
            return 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-300';
        } else if (percent >= 10) {
            return 'border border-slate-500/50 bg-slate-700/60 text-white';
        } else {
            return 'border border-red-400/25 bg-red-500/10 text-red-300';
        }
    };

    const getBatteryIcon = (percent: number) => {
        const level = getBatteryLevelStep(percent);
        if (level === 100) return <FaBatteryFull className="h-5 w-5" />;
        if (level === 75) return <FaBatteryThreeQuarters className="h-5 w-5" />;
        if (level === 50) return <FaBatteryHalf className="h-5 w-5" />;
        if (level === 25) return <FaBatteryQuarter className="h-5 w-5" />;
        return <FaBatteryEmpty className="h-5 w-5" />;
    };

    const batteryPercent = calculateBatteryPercent(systemInfo.batteryData);
    const batteryIsCharging = isBatteryCharging(systemInfo.batteryData);
    const batteryPercentString = batteryPercent >= 0 ? `${batteryPercent}%` : 'Off';
    const networkLabel =
        systemInfo.ipAddress &&
        systemInfo.ipAddress.trim() !== '' &&
        systemInfo.ipAddress.toLowerCase() !== 'unknown' &&
        systemInfo.ipAddress !== '...'
            ? systemInfo.ipAddress
            : 'Disconnected';
    return (
        <nav className="relative z-80 flex h-16 flex-col border-b border-slate-700 bg-slate-800 backdrop-blur-md">
            <div className="flex h-full items-center justify-between px-8">
                <div className="flex h-full w-full items-center">
                    <Link href="/kiosk/" className="flex w-56 items-center gap-2 text-2xl font-bold">
                        <Image
                            src="/assets/logo/SourcceyLogo.png"
                            alt="Sourccey Logo"
                            width={48}
                            height={48}
                            priority
                            className="drop-shadow-logo"
                        />
                        <span className="inline-block bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text pb-1 text-3xl leading-tight text-transparent">
                            Sourccey
                        </span>
                    </Link>

                    <div className="grow" />

                    <div className="ml-auto flex items-center gap-4">
                        {hasConfirmedUpdate ? (
                            <LinkButton
                                href="/kiosk/setup"
                                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition-all duration-300 hover:bg-amber-500/20 hover:text-amber-100"
                                tooltip="Open kiosk update and repair"
                            >
                                <FaSyncAlt className="h-5 w-5" />
                                <span className="hidden sm:inline">Update</span>
                            </LinkButton>
                        ) : null}

                        {/* At-a-glance battery status */}
                        <button
                            onClick={() => setIsBatteryModalOpen(true)}
                            className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-300 hover:border-slate-400/60 hover:bg-slate-600/80 hover:text-white ${
                                isSystemInfoLoading ? 'bg-slate-600/60 text-white' : getBatteryStyles(batteryPercent)
                            }`}
                            title="Battery information"
                        >
                            {isSystemInfoLoading ? (
                                <FaBatteryFull className="h-5 w-5 text-white" />
                            ) : (
                                <span className="relative inline-flex">
                                    {getBatteryIcon(batteryPercent)}
                                    {batteryIsCharging ? <FaBolt className="absolute -top-1 -right-1 h-2.5 w-2.5 text-amber-300" /> : null}
                                </span>
                            )}
                            {isSystemInfoLoading ? (
                                <span className="skeleton-shimmer h-4 w-10 rounded-full bg-slate-500/60" />
                            ) : (
                                <span className="font-semibold">{batteryPercentString}</span>
                            )}
                        </button>

                        {/* WiFi button - show in kiosk mode */}
                        <button
                            onClick={() => setIsWiFiModalOpen(true)}
                            className="flex cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-slate-500/50 bg-slate-700/60 px-3 py-1.5 text-left text-sm font-semibold text-slate-200 transition-all duration-300 hover:border-blue-400/40 hover:bg-slate-600/80 hover:text-white"
                            title="WiFi Settings"
                        >
                            <span className="rounded-lg bg-blue-500/15 p-1.5 text-blue-300">
                                <FaWifi className="h-4 w-4" />
                            </span>
                            <span className="hidden min-w-0 sm:flex sm:flex-col">
                                <span className="leading-4">Wi-Fi</span>
                                {isSystemInfoLoading ? (
                                    <span className="skeleton-shimmer mt-1 h-2.5 w-20 rounded-full bg-slate-500/50" />
                                ) : (
                                    <span className="max-w-32 truncate text-xs font-normal text-slate-400">{networkLabel}</span>
                                )}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            <WiFiModal isOpen={isWiFiModalOpen} onClose={() => setIsWiFiModalOpen(false)} systemInfo={systemInfo} />
            <BatteryModal isOpen={isBatteryModalOpen} onClose={() => setIsBatteryModalOpen(false)} batteryData={systemInfo.batteryData} />
        </nav>
    );
};
