'use client';

import { useEffect, useState } from 'react';
import { FaSave, FaTimes, FaSpinner, FaEye, FaEyeSlash } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import {
    saveAccessPointCredentials,
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
import { setSystemInfo, useGetSystemInfo, type BatteryData, type SystemInfo } from '@/hooks/System/system-info.hook';
import Link from 'next/link';
import { LinkButton } from '@/components/Elements/Link/LinkButton';
import { markPasswordAsChanged } from '@/hooks/Components/SSH/ssh.hook';

export default function KioskSettingsPage() {
    const { data: systemInfo }: any = useGetSystemInfo();
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

    const generateSecurePassword = (length = 12): string => {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*_-+=';
        const result: string[] = [];
        const max = 256 - (256 % charset.length);
        while (result.length < length) {
            const bytes = new Uint8Array(length * 2);
            window.crypto.getRandomValues(bytes);
            for (const randomByte of bytes) {
                if (randomByte < max && result.length < length) {
                    result.push(charset.charAt(randomByte % charset.length));
                }
            }
        }
        return result.join('');
    };

    const handleStartPasswordEdit = () => {
        setNewPassword(generateSecurePassword());
        setIsEditingPassword(true);
    };

    const handleSavePassword = async () => {
        if (newPassword.length < 6) return;
        setIsSavingPassword(true);
        try {
            await invoke('set_pi_password', { password: newPassword });
            await markPasswordAsChanged();
            toast.success('SSH password updated successfully.');
            setNewPassword('');
            setIsEditingPassword(false);
        } catch (error) {
            console.error('Failed to update SSH password:', error);
            toast.error(`Failed to update SSH password: ${error}`);
        } finally {
            setIsSavingPassword(false);
        }
    };

    // Fetch system info
    useEffect(() => {
        const fetchSystemInfo = async () => {
            try {
                const info = await invoke<{
                    ip_address: string;
                    temperature: string;
                    thermal_data: SystemInfo['thermalData'];
                    battery_data: BatteryData;
                }>('get_system_info');
                const systemInfo = {
                    ipAddress: info.ip_address,
                    temperature: info.temperature,
                    thermalData: info.thermal_data,
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

    const handleSaveAPValues = async () => {
        if (!accessPointSSID) {
            toast.error('SSID is required');
            return;
        }

        if (!accessPointPassword || (accessPointPassword as string).length < 8 || (accessPointPassword as string).length > 63) {
            toast.error('Robot network password must be between 8 and 63 characters');
            return;
        }

        setIsSavingAccessPoint(true);
        try {
            await saveAccessPointCredentials(accessPointSSID as string, accessPointPassword as string);
            toast.success('Access point configured successfully', { ...toastSuccessDefaults });
        } catch (error) {
            console.error('Failed to save access point values:', error);
            toast.error(`Failed to save access point values: ${error}`);
        } finally {
            setIsSavingAccessPoint(false);
        }
    };

    const toggleAccessPointMode = () => {
        if (isAccessPointEnabled ?? false) {
            setWiFiMode();
        } else {
            setAccessPointMode();
        }
    };

    const setAccessPointMode = async () => {
        if (!accessPointSSID) {
            toast.error('SSID is required');
            return;
        }

        if (!accessPointPassword || (accessPointPassword as string).length < 8 || (accessPointPassword as string).length > 63) {
            toast.error('Robot network password must be between 8 and 63 characters');
            return;
        }

        setIsTogglingAccessPoint(true);
        try {
            await saveAccessPointCredentials(accessPointSSID as string, accessPointPassword as string);
            await invoke('set_access_point', {
                ssid: accessPointSSID,
                password: accessPointPassword,
            });
            setAccessPointEnabled(true);
            toast.success('Sourccey is now broadcasting its Wi-Fi network.', { ...toastSuccessDefaults });
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
            await invoke('set_wifi', { ssid: firstSavedSSID ?? '' });
            setAccessPointEnabled(false);
            toast.success('Robot Wi-Fi router disabled.', { ...toastSuccessDefaults });
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

                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <span className="text-sm font-medium text-slate-300">Username</span>
                            <span className="text-sm font-semibold text-slate-300">sourccey</span>
                        </div>

                        <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-sm font-medium text-slate-300">Password</span>
                                {!isEditingPassword && (
                                    <button
                                        type="button"
                                        onClick={handleStartPasswordEdit}
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
                                            type="password"
                                            value={newPassword}
                                            onChange={(event) => setNewPassword(event.target.value)}
                                            placeholder="Enter new password (min 6 characters)"
                                            autoComplete="new-password"
                                            className="flex-1 rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30 focus:outline-none"
                                            disabled={isSavingPassword}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setNewPassword(generateSecurePassword())}
                                            className="cursor-pointer rounded bg-purple-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            disabled={isSavingPassword}
                                        >
                                            Randomize
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void handleSavePassword()}
                                            disabled={newPassword.length < 6 || isSavingPassword}
                                            className="flex items-center gap-2 rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <FaSave className="h-4 w-4" />
                                            {isSavingPassword ? 'Saving...' : 'Save Password'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setNewPassword('');
                                                setIsEditingPassword(false);
                                            }}
                                            disabled={isSavingPassword}
                                            className="flex items-center gap-2 rounded bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <FaTimes className="h-4 w-4" />
                                            Cancel
                                        </button>
                                    </div>
                                    <div className="rounded-lg border border-yellow-600 bg-yellow-900/20 p-3 text-xs text-yellow-300">
                                        The password is masked and is never stored or displayed after saving.
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400">
                                    Set a replacement password for SSH access. The current password is never revealed.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Access Point Section */}
                <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold text-white">Robot Wi-Fi Router</h2>
                        <p className="mt-1 max-w-3xl text-sm text-slate-400">
                            Access Point mode makes Sourccey act as its own Wi-Fi router. Nearby devices can join the network broadcast by
                            the robot using the credentials below.
                        </p>
                    </div>

                    <div className="space-y-4">
                        {/* Toggle for Access Point Mode */}
                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-300">Broadcast Robot Wi-Fi</span>
                                        {isTogglingAccessPoint && <FaSpinner className="h-4 w-4 animate-spin text-slate-400" />}
                                    </div>
                                    <span className="mt-1 text-xs text-slate-400">
                                        {isAccessPointEnabled
                                            ? 'On — Sourccey is acting as a Wi-Fi router'
                                            : 'Off — Sourccey uses an existing Wi-Fi network'}
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
                                    Robot Network Name (SSID)
                                </label>
                                <input
                                    id="ap-ssid"
                                    type="text"
                                    value={(accessPointSSID as string) ?? 'sourccey'}
                                    onChange={(e) => setAccessPointSSID(e.target.value)}
                                    placeholder="Enter the Wi-Fi name Sourccey will broadcast"
                                    className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30 focus:outline-none"
                                    disabled={isSavingAccessPoint}
                                />
                                <p className="mt-2 text-xs text-slate-400">This is the network name shown to devices near the robot.</p>
                            </div>

                        {/* Password Input */}
                            <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                                <label htmlFor="ap-password" className="mb-2 block text-sm font-medium text-slate-300">
                                    Robot Network Password
                                </label>
                                <div className="relative">
                                    <input
                                        id="ap-password"
                                        type={showAccessPointPassword ? 'text' : 'password'}
                                        value={(accessPointPassword as string | undefined) ?? ''}
                                        onChange={(e) => setAccessPointPassword(e.target.value)}
                                        placeholder="Enter the password for the robot's Wi-Fi network"
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
                                <p className="mt-2 text-xs text-slate-400">
                                    Devices use this password when joining the Wi-Fi network broadcast by Sourccey.
                                </p>
                            </div>

                        {/* Save Button */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSaveAPValues}
                                    disabled={
                                        !accessPointSSID ||
                                        !accessPointPassword ||
                                        (accessPointPassword as string).length < 8 ||
                                        (accessPointPassword as string).length > 63 ||
                                        isTogglingAccessPoint ||
                                        isSavingAccessPoint
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
                                            Save Robot Network Credentials
                                        </>
                                    )}
                                </button>
                            </div>
                    </div>
                </div>

                {/* Developer Settings Section */}
                <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                    <div className="mb-4">
                        <h2 className="text-xl font-semibold text-white">Developer Settings</h2>
                        <p className="mt-1 text-sm text-slate-400">
                            Choose which Vulcan environment this kiosk should use for cloud registration and websocket relay.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <LinkButton
                            href="/kiosk/settings/developer"
                            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
                        >
                            Open Developer Settings
                        </LinkButton>
                    </div>
                </div>

                {/* Logs Section */}
                <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                    <div className="mb-4">
                        <h2 className="text-xl font-semibold text-white">Logs</h2>
                        <p className="mt-1 text-sm text-slate-400">View recent kiosk logs for debugging.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link
                            href="/kiosk/settings/logs"
                            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
                        >
                            Open Logs
                        </Link>
                    </div>
                </div>

                {/* Kiosk Update Section */}
                <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                    <div className="mb-4">
                        <h2 className="text-xl font-semibold text-white">Kiosk Updates</h2>
                        <p className="mt-1 text-sm text-slate-400">
                            Repair the robot runtime or pull the latest kiosk code and run the full setup.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <LinkButton
                            href="/kiosk/setup"
                            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-amber-500/50 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-400/70"
                        >
                            Open Kiosk Update
                        </LinkButton>
                    </div>
                </div>

            </div>
        </div>
    );
}
