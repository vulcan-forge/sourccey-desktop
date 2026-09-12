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

    const { data: systemInfo }: any = useGetSystemInfo();
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
            return 'bg-slate-600/60 text-green-400';
        } else if (percent >= 10) {
            return 'bg-slate-600/60 text-white';
        } else {
            return 'bg-slate-600/60 text-red-400';
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
                        <div
                            className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
                                isSystemInfoLoading ? 'bg-slate-600/60 text-white' : getBatteryStyles(batteryPercent)
                            }`}
                            title="Battery status"
                        >
                            {isSystemInfoLoading ? (
                                <FaBatteryFull className="h-5 w-5 text-white" />
                            ) : (
                                <span className="relative inline-flex">
                                    {getBatteryIcon(batteryPercent)}
                                    {batteryIsCharging ? (
                                        <FaBolt className="absolute -top-1 -right-1 h-2.5 w-2.5 text-amber-300" />
                                    ) : null}
                                </span>
                            )}
                            {isSystemInfoLoading ? (
                                <span className="skeleton-shimmer h-4 w-10 rounded-full bg-slate-500/60" />
                            ) : (
                                <span className="font-semibold">{batteryPercentString}</span>
                            )}
                        </div>

                        {/* WiFi button - show in kiosk mode */}
                        <button
                            onClick={() => setIsWiFiModalOpen(true)}
                            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-600/60 px-4 py-2 text-sm font-semibold text-slate-300 transition-all duration-300 hover:bg-slate-600/80 hover:text-white"
                            title="WiFi Settings"
                        >
                            <FaWifi className="h-5 w-5" />
                            <span className="hidden sm:inline">WiFi</span>
                            {isSystemInfoLoading ? (
                                <span className="skeleton-shimmer h-3 w-20 rounded-full bg-slate-500/50" />
                            ) : (
                                <span className="text-xs text-slate-400">{networkLabel}</span>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <WiFiModal isOpen={isWiFiModalOpen} onClose={() => setIsWiFiModalOpen(false)} systemInfo={systemInfo} />
        </nav>
    );
};
