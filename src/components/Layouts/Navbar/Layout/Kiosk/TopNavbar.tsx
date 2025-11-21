import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FaWifi, FaInfoCircle, FaBatteryHalf, FaWindowClose } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { useVirtualKeyboard } from '@/context/virtual-keyboard-context';
import { WiFiModal } from '@/components/Elements/Modals/KioskRobotModals/WiFiModal';
import { useRobotStatus } from '@/context/robot-status-context';
import { CredentialsModal } from '@/components/Elements/Modals/KioskRobotModals/CredentialsModal';
import { RobotStatusModal } from '@/components/Elements/Modals/KioskRobotModals/RobotStatusModal';
import type { BatteryData } from '@/app/app/settings/page';
import { exit } from '@tauri-apps/plugin-process';

export const KioskTopNavbar = () => {
    const { robotStarted, isHostReady } = useRobotStatus();
    const { toggle: toggleVirtualKeyboard } = useVirtualKeyboard();

    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const [isWiFiModalOpen, setIsWiFiModalOpen] = useState(false);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
    const [isFetchingCreds, setIsFetchingCreds] = useState(false);
    const [piCredentials, setPiCredentials] = useState({ username: '...', password: '...' });
    const [systemInfo, setSystemInfo] = useState({
        ipAddress: '...',
        temperature: '...',
        batteryData: {
            voltage: -1,
            percent: -1,
        },
    });

    const handleToggleKeyboard = async () => {
        toggleVirtualKeyboard();
    };

    // Fetch Raspberry Pi credentials when opening the modal
    const handleOpenCreds = async () => {
        setIsCredsModalOpen(true);
        setIsFetchingCreds(true);
        try {
            // Expected to be implemented in Tauri backend; provide graceful fallback on non-Linux
            const creds = await invoke<{ username: string; password: string }>('get_pi_credentials');
            setPiCredentials({ username: creds.username, password: creds.password });
        } catch (error) {
            console.warn('Could not fetch Raspberry Pi credentials. Falling back to placeholders.', error);
            setPiCredentials({ username: 'unknown', password: 'unknown' });
        } finally {
            setIsFetchingCreds(false);
        }
    };

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

    const username = piCredentials.username ?? 'unknown';
    console.log('username', username);

    const isDevMode = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    return (
        <nav className="relative z-80 flex h-16 flex-col border-b border-slate-700 bg-slate-800 backdrop-blur-md">
            <div className="flex h-full items-center justify-between px-8">
                <div className="flex h-full w-full items-center">
                    <Link href="/app" className="flex w-56 items-center gap-2 text-2xl font-bold">
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
                        {isDevMode && (
                            <button
                                onClick={async () => {
                                    await exit();
                                }}
                                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-600/60 px-4 py-2 text-sm font-semibold text-slate-300 transition-all duration-300 hover:bg-slate-600/80 hover:text-white"
                                title="Close Application"
                            >
                                <FaWindowClose className="h-5 w-5" />
                                <span className="hidden sm:inline">Close</span>
                            </button>
                        )}

                        {/* Connect Details button - kiosk mode */}
                        <button
                            onClick={handleOpenCreds}
                            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-600/60 px-4 py-2 text-sm font-semibold text-slate-300 transition-all duration-300 hover:bg-slate-600/80 hover:text-white"
                            title="Show Connection Details"
                        >
                            <FaInfoCircle className="h-5 w-5" />
                            <span className="hidden sm:inline">Device</span>
                        </button>

                        {/* Battery Life and Robot Status button - kiosk mode */}
                        <button
                            onClick={() => setIsStatusModalOpen(!isStatusModalOpen)}
                            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-300 ${
                                isStatusModalOpen
                                    ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white hover:from-orange-600 hover:to-yellow-600'
                                    : systemInfo.batteryData.percent >= 0
                                      ? systemInfo.batteryData.percent > 50
                                          ? 'bg-slate-600/60 text-green-400 hover:bg-slate-600/80 hover:text-green-300'
                                          : systemInfo.batteryData.percent > 20
                                            ? 'bg-slate-600/60 text-slate-300 hover:bg-slate-600/80 hover:text-white'
                                            : 'bg-slate-600/60 text-red-400 hover:bg-slate-600/80 hover:text-red-300'
                                      : 'bg-slate-600/60 text-slate-300 hover:bg-slate-600/80 hover:text-white'
                            }`}
                            title={isStatusModalOpen ? 'Close Robot Status' : 'View Robot Status'}
                        >
                            <FaBatteryHalf className="h-5 w-5" />
                            <span className="font-semibold">
                                {systemInfo.batteryData.percent >= 0 ? `${systemInfo.batteryData.percent}%` : 'Off'}
                            </span>
                        </button>

                        {/* WiFi button - show in kiosk mode */}
                        <button
                            onClick={() => setIsWiFiModalOpen(true)}
                            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-600/60 px-4 py-2 text-sm font-semibold text-slate-300 transition-all duration-300 hover:bg-slate-600/80 hover:text-white"
                            title="WiFi Settings"
                        >
                            <FaWifi className="h-5 w-5" />
                            <span className="hidden sm:inline">WiFi</span>
                            <span className="text-xs text-slate-400">{systemInfo.ipAddress}</span>
                        </button>
                    </div>
                </div>
            </div>

            <RobotStatusModal
                isOpen={isStatusModalOpen}
                onClose={() => setIsStatusModalOpen(false)}
                systemInfo={systemInfo}
                isHostReady={isHostReady}
            />
            <WiFiModal isOpen={isWiFiModalOpen} onClose={() => setIsWiFiModalOpen(false)} systemInfo={systemInfo} />
            <CredentialsModal
                isOpen={isCredsModalOpen}
                onClose={() => setIsCredsModalOpen(false)}
                systemInfo={systemInfo}
                piCredentials={piCredentials}
                isFetchingCreds={isFetchingCreds}
            />
        </nav>
    );
};
