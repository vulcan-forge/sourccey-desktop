'use client';

import { useEffect, useState } from 'react';
import { FaSave, FaTimes, FaSpinner, FaEye, FaEyeSlash } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { markPasswordAsChanged } from '@/hooks/Components/SSH/ssh.hook';
import { toast } from 'react-toastify';
import type { RemoteConfig } from '@/components/PageComponents/Robots/RemoteRobotConfig';
import {
    setAccessPointEnabled,
    setAccessPointPassword,
    setAccessPointSSID,
    useGetAccessPointEnabled,
    useGetAccessPointSSID,
} from '@/hooks/WIFI/access-point.hook';
import { useGetAccessPointPassword } from '@/hooks/WIFI/access-point.hook';
import { toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { getSavedWiFiSSIDs } from '@/hooks/WIFI/wifi.hook';
import clsx from 'clsx';
import { setSystemInfo, useGetSystemInfo, type BatteryData } from '@/hooks/System/system-info.hook';
import { useModalContext } from '@/hooks/Modals/context.hook';
import { KIOSK_PAIRING_MODAL_ID } from '@/components/Elements/Modals/KioskRobotModals/PairingCodeModal';

interface PiCredentials {
    username: string;
}

export default function KioskSettingsPage() {
    const { data: systemInfo }: any = useGetSystemInfo();
    const { openModal } = useModalContext();

    const [piCredentials, setPiCredentials] = useState<PiCredentials>({
        username: '...',
    });

    const [isFetchingCreds, setIsFetchingCreds] = useState(false);
    const [isEditingPassword, setIsEditingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [isSavingPassword, setIsSavingPassword] = useState(false);

    // Access Point state with defaults
    const { data: accessPointEnabledData }: any = useGetAccessPointEnabled();
    const isAccessPointEnabled = (accessPointEnabledData as boolean) ?? false;
    const { data: accessPointSSID }: any = useGetAccessPointSSID();
    const { data: accessPointPassword }: any = useGetAccessPointPassword();

    const [isTogglingAccessPoint, setIsTogglingAccessPoint] = useState(false);
    const [isSavingAccessPoint, setIsSavingAccessPoint] = useState(false);
    const [showAccessPointPassword, setShowAccessPointPassword] = useState(false);
    const [remoteConfig, setRemoteConfig] = useState<RemoteConfig | null>(null);
    const [isLoadingConfig, setIsLoadingConfig] = useState(false);

    const generateSecurePassword = (length = 12): string => {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*_-+=';
        const charsetLength = charset.length;
        const result: string[] = [];
        const max = 256 - (256 % charsetLength);
        const getBytes = (size: number) => {
            const buffer = new Uint8Array(size);
            window.crypto.getRandomValues(buffer);
            return buffer;
        };

        while (result.length < length) {
            const bytes = getBytes(length * 2);
            for (let i = 0; i < bytes.length && result.length < length; i++) {
                const randomByte = bytes[i];
                if (randomByte !== undefined && randomByte < max) {
                    const index = randomByte % charsetLength;
                    result.push(charset.charAt(index));
                }
            }
        }

        return result.join('');
    };

    const handleRandomizePassword = () => {
        const pwd = generateSecurePassword(12);
        setIsEditingPassword(true);
        setNewPassword(pwd);
    };

    // Fetch system info
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
        const interval = setInterval(fetchSystemInfo, 5000); // Update every 5 seconds
        return () => clearInterval(interval);
    }, []);

    // Fetch Pi credentials
    useEffect(() => {
        const fetchCredentials = async () => {
            setIsFetchingCreds(true);
            try {
                // Fetch the current username from the system
                const username = await invoke<string>('get_pi_username');
                setPiCredentials({ username });
            } catch (error) {
                console.warn('Could not fetch Raspberry Pi username. Using default.', error);
                setPiCredentials({ username: 'unknown' });
            } finally {
                setIsFetchingCreds(false);
            }
        };

        fetchCredentials();
    }, []);

    // Fetch RemoteConfig
    useEffect(() => {
        const fetchRemoteConfig = async () => {
            setIsLoadingConfig(true);
            try {
                // Using 'sourccey' as default nickname for kiosk mode
                const config = await invoke<RemoteConfig>('read_remote_config', { nickname: 'sourccey' });
                setRemoteConfig(config);
            } catch (error) {
                console.error('Failed to load remote config:', error);
                toast.error('Failed to load robot configuration');
            } finally {
                setIsLoadingConfig(false);
            }
        };

        fetchRemoteConfig();
    }, []);

    const handleSavePassword = async () => {
        if (!newPassword.trim()) return;

        setIsSavingPassword(true);
        try {
            // Attempt to set the system password via Tauri backend (Linux only)
            await invoke('set_pi_password', { username: piCredentials.username, password: newPassword });

            // Mark password as changed in persistent storage (now async)
            await markPasswordAsChanged();

            toast.success('Password updated successfully! Make sure you wrote it down.');
            setIsEditingPassword(false);
            setNewPassword('');
        } catch (error) {
            console.error('Failed to save password:', error);
            toast.error(`Failed to save password: ${error}`);
        } finally {
            setIsSavingPassword(false);
        }
    };

    const handleSaveAPValues = async () => {
        if (!remoteConfig) {
            toast.error('Robot configuration not loaded');
            return;
        }

        if (!accessPointSSID) {
            toast.error('SSID is required');
            return;
        }

        if (!accessPointPassword) {
            toast.error('Password is required');
            return;
        }

        setIsSavingAccessPoint(true);
        try {
            setAccessPointSSID(accessPointSSID);
            setAccessPointPassword(accessPointPassword as string);
            toast.success('Access point configured successfully', { ...toastSuccessDefaults });
        } catch (error) {
            console.error('Failed to save access point values:', error);
            toast.error(`Failed to save access point values: ${error}`);
        } finally {
            setIsSavingAccessPoint(false);
        }
    };

    const handleCancelEdit = () => {
        setIsEditingPassword(false);
        setNewPassword('');
    };

    const toggleAccessPointMode = () => {
        if (isAccessPointEnabled ?? false) {
            setWiFiMode();
        } else {
            setAccessPointMode();
        }
    };

    const setAccessPointMode = async () => {
        if (!remoteConfig) {
            toast.error('Robot configuration not loaded');
            return;
        }

        if (!accessPointSSID) {
            toast.error('SSID is required');
            return;
        }

        if (!accessPointPassword) {
            toast.error('Password is required');
            return;
        }

        setIsTogglingAccessPoint(true);
        try {
            const result = await invoke('set_access_point', {
                ssid: accessPointSSID,
                password: accessPointPassword,
            });
            if (result) {
                setAccessPointEnabled(true);
                toast.success('Access Point mode activated successfully', { ...toastSuccessDefaults });
            } else {
                setAccessPointEnabled(false);
                toast.error('Failed to set Access Point mode');
            }
        } catch (error) {
            console.error('Failed to set access point mode:', error);
            toast.error(`Failed to set access point mode: ${error}`);
        } finally {
            setIsTogglingAccessPoint(false);
        }
    };

    const setWiFiMode = async () => {
        setIsTogglingAccessPoint(true);
        try {
            const firstSavedSSID = getSavedWiFiSSIDs()?.length > 0 ? getSavedWiFiSSIDs()[0] : null;
            const result = await invoke('set_wifi', { ssid: firstSavedSSID ?? '' });
            if (result === 'SUCCESS') {
                setAccessPointEnabled(false);
                toast.success('WiFi mode activated successfully', { ...toastSuccessDefaults });
            } else {
                setAccessPointEnabled(true);
                toast.error('Failed to set WiFi mode');
            }
        } catch (error) {
            console.error('Failed to set WiFi mode:', error);
            toast.error(`Failed to set WiFi mode: ${error}`);
        } finally {
            setIsTogglingAccessPoint(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto flex flex-col gap-8 px-8 py-8">
                <div className="">
                    <h1 className="text-3xl font-bold text-white">Kiosk Settings</h1>
                    <p className="mt-2 text-slate-300">Manage your robot&apos;s configuration and credentials</p>
                </div>

                {/* Credentials Section */}
                <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold text-white">Robot Credentials</h2>
                        <p className="mt-1 text-sm text-slate-400">Manage your robot&apos;s connection credentials</p>
                    </div>

                    <div className="space-y-4">
                        {/* IP Address */}
                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-slate-300">IP Address</span>
                            </div>
                            <span className="text-sm font-semibold text-slate-300">{systemInfo.ipAddress}</span>
                        </div>

                        {/* Username */}
                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-slate-300">Username</span>
                            </div>
                            <span className="text-sm font-semibold text-slate-300">
                                {isFetchingCreds ? 'Loading…' : piCredentials.username}
                            </span>
                        </div>

                        {/* Password */}
                        <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-sm font-medium text-slate-300">Password</span>
                                {!isEditingPassword && (
                                    <button
                                        onClick={handleRandomizePassword}
                                        className="cursor-pointer rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                                    >
                                        Set New Password
                                    </button>
                                )}
                            </div>

                            {isEditingPassword ? (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="Enter new password (min 8 characters)"
                                            autoComplete="off"
                                            className="flex-1 rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30 focus:outline-none"
                                            disabled={isSavingPassword}
                                        />
                                        <button
                                            onClick={handleRandomizePassword}
                                            className="cursor-pointer rounded bg-purple-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-700"
                                            disabled={isSavingPassword}
                                        >
                                            Randomize
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleSavePassword}
                                            disabled={!newPassword.trim() || isSavingPassword}
                                            className="flex items-center gap-2 rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <FaSave className="h-4 w-4" />
                                            {isSavingPassword ? 'Saving...' : 'Save Password'}
                                        </button>
                                        <button
                                            onClick={handleCancelEdit}
                                            disabled={isSavingPassword}
                                            className="flex items-center gap-2 rounded bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <FaTimes className="h-4 w-4" />
                                            Cancel
                                        </button>
                                    </div>

                                    {newPassword && (
                                        <div className="rounded-lg border border-yellow-600 bg-yellow-900/20 p-3">
                                            <p className="text-xs text-yellow-300">
                                                <strong>⚠ Important:</strong> Write down this password before saving! It will not be stored
                                                anywhere. If you lose it, you can always regenerate it from this page.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400">
                                    Click &quot;Set New Password&quot; to generate or enter a new password for SSH access.
                                </p>
                            )}
                        </div>

                    </div>
                </div>

                {/* Pairing Section */}
                <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold text-white">Pair Robot</h2>
                        <p className="mt-1 text-sm text-slate-400">Generate a pairing code for the desktop app</p>
                    </div>

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-slate-300">
                            Use this to link the desktop app to this robot. A new code is generated every 10 minutes.
                        </div>
                        <button
                            onClick={() => openModal(KIOSK_PAIRING_MODAL_ID, { source: 'settings' })}
                            className="cursor-pointer rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                        >
                            Show Pairing Code
                        </button>
                    </div>
                </div>

                {/* Access Point Section */}
                <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold text-white">Access Point</h2>
                        <p className="mt-1 text-sm text-slate-400">Manage your robot&apos;s access point configuration</p>
                    </div>

                    {isLoadingConfig ? (
                        <div className="flex items-center justify-center py-8">
                            <FaSpinner className="h-5 w-5 animate-spin text-slate-400" />
                            <span className="ml-2 text-sm text-slate-400">Loading configuration...</span>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Toggle for Access Point Mode */}
                            <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-300">Access Point Mode</span>
                                        {isTogglingAccessPoint && <FaSpinner className="h-4 w-4 animate-spin text-slate-400" />}
                                    </div>
                                    <span className="mt-1 text-xs text-slate-400">
                                        {isAccessPointEnabled
                                            ? 'Robot will broadcast its own WiFi network'
                                            : 'Robot will connect to an existing WiFi network'}
                                    </span>
                                </div>
                                <label className="relative inline-flex cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        checked={(isAccessPointEnabled as boolean) ?? false}
                                        onChange={toggleAccessPointMode}
                                        className="peer sr-only"
                                        disabled={isTogglingAccessPoint}
                                    />
                                    <div className="peer h-6 w-11 rounded-full bg-slate-600 transition-colors peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-800/20 peer-focus:outline-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                                </label>
                            </div>

                            {/* SSID Input */}
                            <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                                <label htmlFor="ap-ssid" className="mb-2 block text-sm font-medium text-slate-300">
                                    {isAccessPointEnabled ? 'Access Point SSID' : 'WiFi Network SSID'}
                                </label>
                                <input
                                    id="ap-ssid"
                                    type="text"
                                    value={(accessPointSSID as string) ?? 'sourccey'}
                                    onChange={(e) => setAccessPointSSID(e.target.value)}
                                    placeholder={isAccessPointEnabled ? 'Enter access point name' : 'Enter WiFi network name'}
                                    className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30 focus:outline-none"
                                    disabled={isSavingAccessPoint}
                                />
                            </div>

                            {/* Password Input */}
                            <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                                <label htmlFor="ap-password" className="mb-2 block text-sm font-medium text-slate-300">
                                    {isAccessPointEnabled ? 'Access Point Password' : 'WiFi Password'}
                                </label>
                                <div className="relative">
                                    <input
                                        id="ap-password"
                                        type={showAccessPointPassword ? 'text' : 'password'}
                                        value={accessPointPassword as string}
                                        onChange={(e) => setAccessPointPassword(e.target.value)}
                                        placeholder={isAccessPointEnabled ? 'Enter access point password' : 'Enter WiFi password'}
                                        className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 pr-10 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30 focus:outline-none"
                                        disabled={isSavingAccessPoint}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowAccessPointPassword(!showAccessPointPassword)}
                                        className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1.5 text-slate-400 transition-colors hover:text-slate-200 focus:ring-2 focus:ring-yellow-500/30 focus:outline-none"
                                        disabled={isSavingAccessPoint}
                                        aria-label={showAccessPointPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showAccessPointPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Save Button */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSaveAPValues}
                                    disabled={
                                        !accessPointSSID ||
                                        !accessPointPassword ||
                                        isTogglingAccessPoint ||
                                        isSavingAccessPoint ||
                                        !remoteConfig
                                    }
                                    className={clsx(
                                        'flex cursor-pointer items-center gap-2 rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50',
                                        isTogglingAccessPoint && 'cursor-not-allowed opacity-50'
                                    )}
                                >
                                    {isSavingAccessPoint ? (
                                        <>
                                            <FaSpinner className="h-4 w-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <FaSave className="h-4 w-4" />
                                            Save Access Point
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
