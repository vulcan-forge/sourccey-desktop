'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { FaTimes, FaCircle, FaBatteryHalf, FaWifi, FaBatteryFull, FaBatteryQuarter, FaBolt, FaBatteryEmpty, FaBatteryThreeQuarters } from 'react-icons/fa';
import type { SystemInfo } from '@/hooks/System/system-info.hook';
interface RobotStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    systemInfo: SystemInfo;
    isRobotStarted: boolean;
}

type KioskPairingInfo = {
    service_port: number;
};

const DISCOVERY_UDP_PORT = 42111;

export const RobotStatusModal = ({ isOpen, onClose, systemInfo, isRobotStarted }: RobotStatusModalProps) => {
    const [servicePort, setServicePort] = useState<number | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        const loadPairingInfo = async () => {
            try {
                const info = await invoke<KioskPairingInfo>('get_kiosk_pairing_info');
                if (!cancelled) {
                    setServicePort(info?.service_port ?? null);
                }
            } catch {
                if (!cancelled) {
                    setServicePort(null);
                }
            }
        };

        loadPairingInfo();
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const getBatteryTextColor = (percent: number) => {
        if (percent > 75) {
            return 'text-green-400';
        } else if (percent > 25) {
            return 'text-slate-300';
        } else if (percent > 10) {
            return 'text-yellow-400';
        } else {
            return 'text-red-400';
        }
    };

    const getBatteryIcon = (percent: number, charging?: boolean) => {
        if (charging) {
            return <FaBolt className="h-5 w-5" />;
        }
        if (percent > 75) {
            return <FaBatteryFull className="h-5 w-5" />;
        } else if (percent > 50) {
            return <FaBatteryThreeQuarters className="h-5 w-5" />;
        } else if (percent > 25) {
            return <FaBatteryHalf className="h-5 w-5" />;
        } else if (percent > 5) {
            return <FaBatteryQuarter className="h-5 w-5" />;
        } else {
            return <FaBatteryEmpty className="h-5 w-5" />;
        }
    };

    const batteryPercent = systemInfo.batteryData.percent >= 0 ? systemInfo.batteryData.percent : 0;
    const batteryPercentString = batteryPercent >= 0 ? `${batteryPercent}%` : 'Off';
    
    return (
        typeof window !== 'undefined' &&
        createPortal(
            <div
                className="fixed inset-0 z-[2000] flex cursor-pointer items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
                onClick={onClose}
            >
                <div
                    className="relative max-h-[80vh] w-[90vw] max-w-md cursor-default overflow-auto rounded-lg border border-slate-600 bg-slate-800 p-6 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-xl font-semibold text-white">Robot Status</h3>
                        <button
                            onClick={onClose}
                            className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                        >
                            <FaTimes className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="flex items-center gap-3">
                                <div className={`${isRobotStarted ? 'text-green-400' : 'text-slate-500'}`}>
                                    <FaCircle />
                                </div>
                                <span className="text-sm font-medium text-slate-300">Robot Status</span>
                            </div>
                            <div className={`text-sm font-semibold ${isRobotStarted ? 'text-green-400' : 'text-slate-500'}`}>
                                {isRobotStarted ? 'Online' : 'Inactive'}
                            </div>
                        </div>                        

                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="flex items-center gap-3">
                                <div className="text-slate-400">
                                    <FaWifi />
                                </div>
                                <span className="text-sm font-medium text-slate-300">IP Address</span>
                            </div>
                            <div className="text-sm font-semibold text-slate-300">{systemInfo.ipAddress}</div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="flex items-center gap-3">
                                <div className="text-slate-400">
                                    <FaWifi />
                                </div>
                                <span className="text-sm font-medium text-slate-300">Discovery Ports</span>
                            </div>
                            <div className="text-right text-xs font-semibold text-slate-300">
                                <div>UDP {DISCOVERY_UDP_PORT}</div>
                                <div>TCP {servicePort ?? '—'}</div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="flex items-center gap-3">
                                <div className="text-slate-400">
                                    {getBatteryIcon(batteryPercent, systemInfo.batteryData.charging)}
                                </div>
                                <span className="text-sm font-medium text-slate-300">Battery Life</span>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <div
                                        className={`text-base font-semibold ${
                                            getBatteryTextColor(batteryPercent)
                                    }`}
                                >
                                    {batteryPercentString}
                                </div>
                                <div className="text-xs font-medium text-slate-400">({systemInfo.batteryData.voltage} V)</div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="flex items-center gap-3">
                                <div className="text-slate-400"></div>
                                <span className="text-sm font-medium text-slate-300">Temperature</span>
                            </div>
                            <div className="text-sm font-semibold text-slate-300">{systemInfo.temperature}</div>
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        )
    );
};
