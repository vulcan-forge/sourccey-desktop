'use client';

import { useEffect, useRef, useState } from 'react';
import { FaSave, FaTimes, FaSpinner, FaEye, FaEyeSlash } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import {
    saveAccessPointCredentials,
    cacheAccessPointCredentials,
    cacheAccessPointStatus,
    DEFAULT_ACCESS_POINT_SSID,
    useGetAccessPointCredentials,
    useGetAccessPointStatus,
    type AccessPointStatus,
    type WiFiModeResult,
} from '@/hooks/WIFI/access-point.hook';
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
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);

    // Access Point state with defaults
    const accessPointStatus = useGetAccessPointStatus();
    const isAccessPointEnabled = accessPointStatus.data?.active ?? false;
    const accessPointCredentials = useGetAccessPointCredentials();
    const [accessPointSSID, setAccessPointSSID] = useState('');
    const [accessPointPassword, setAccessPointPassword] = useState('');
    const credentialsInitialized = useRef(false);
    const networkOperation = useRef(false);

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

    useEffect(() => {
        if (
            !accessPointCredentials.isSuccess ||
            !accessPointCredentials.isFetchedAfterMount ||
            accessPointCredentials.isFetching ||
            credentialsInitialized.current
        )
            return;
        credentialsInitialized.current = true;
        setAccessPointSSID(accessPointCredentials.data?.ssid ?? DEFAULT_ACCESS_POINT_SSID);
        setAccessPointPassword(accessPointCredentials.data?.password ?? generateSecurePassword());
    }, [
        accessPointCredentials.isSuccess,
        accessPointCredentials.isFetchedAfterMount,
        accessPointCredentials.isFetching,
        accessPointCredentials.data,
    ]);

    const credentialsReady =
        accessPointCredentials.isSuccess && accessPointCredentials.isFetchedAfterMount && !accessPointCredentials.isFetching;
    const networkUnavailable =
        !accessPointStatus.data ||
        !!accessPointStatus.error ||
        !accessPointStatus.isFetchedAfterMount ||
        !credentialsReady ||
        !!accessPointCredentials.error;

    const handleStartPasswordEdit = () => {
        setNewPassword('vulcan');
        setShowNewPassword(false);
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
            setShowNewPassword(false);
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
        if (networkOperation.current || networkUnavailable) return;
        if (!accessPointSSID) {
            toast.error('SSID is required');
            return;
        }

        if (!accessPointPassword || (accessPointPassword as string).length < 8 || (accessPointPassword as string).length > 63) {
            toast.error('Robot network password must be between 8 and 63 characters');
            return;
        }

        networkOperation.current = true;
        setIsSavingAccessPoint(true);
        try {
            if (isAccessPointEnabled) {
                const status = await invoke<AccessPointStatus>('set_access_point', {
                    ssid: accessPointSSID,
                    password: accessPointPassword,
                });
                cacheAccessPointStatus(status);
                cacheAccessPointCredentials(accessPointSSID, accessPointPassword);
                toast.success('Robot Wi-Fi updated. Reconnect your controller using the new credentials.', { ...toastSuccessDefaults });
            } else {
                await saveAccessPointCredentials(accessPointSSID as string, accessPointPassword as string);
                toast.success('Robot network credentials saved.', { ...toastSuccessDefaults });
            }
        } catch (error) {
            console.error('Failed to save access point values:', error);
            toast.error(`Failed to save access point values: ${error}`);
        } finally {
            setIsSavingAccessPoint(false);
            networkOperation.current = false;
            void accessPointStatus.refetch();
        }
    };

    const toggleAccessPointMode = () => {
        if (networkOperation.current || networkUnavailable) return;
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

        networkOperation.current = true;
        setIsTogglingAccessPoint(true);
        try {
            const status = await invoke<AccessPointStatus>('set_access_point', {
                ssid: accessPointSSID,
                password: accessPointPassword,
            });
            cacheAccessPointStatus(status);
            cacheAccessPointCredentials(accessPointSSID, accessPointPassword);
            toast.success('Sourccey is now broadcasting its Wi-Fi network.', { ...toastSuccessDefaults });
        } catch (error) {
            console.error('Failed to set access point mode:', error);
            toast.error(`Failed to set access point mode: ${error}`);
        } finally {
            setIsTogglingAccessPoint(false);
            networkOperation.current = false;
            void accessPointStatus.refetch();
        }
    };

    const setWiFiMode = async () => {
        networkOperation.current = true;
        setIsTogglingAccessPoint(true);
        try {
            const firstSavedSSID = getSavedWiFiSSIDs()?.length > 0 ? getSavedWiFiSSIDs()[0] : null;
            const result = await invoke<WiFiModeResult>('set_wifi', { ssid: firstSavedSSID ?? '' });
            cacheAccessPointStatus({ active: false, ssid: null, ip_address: null, interface: null });
            if (result.reconnected) toast.success(result.message, { ...toastSuccessDefaults });
            else toast.info(result.message);
        } catch (error) {
            console.error('Failed to set WiFi mode:', error);
            toast.error(`Failed to set WiFi mode: ${error}`);
        } finally {
            setIsTogglingAccessPoint(false);
            networkOperation.current = false;
            void accessPointStatus.refetch();
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
                                        <div className="relative flex-1">
                                            <input
                                                type={showNewPassword ? 'text' : 'password'}
                                                value={newPassword}
                                                onChange={(event) => setNewPassword(event.target.value)}
                                                placeholder="Enter new password (min 6 characters)"
                                                autoComplete="new-password"
                                                className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 pr-10 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30 focus:outline-none"
                                                disabled={isSavingPassword}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowNewPassword((visible) => !visible)}
                                                className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-slate-400 hover:text-white"
                                                aria-label={showNewPassword ? 'Hide SSH password' : 'Show SSH password'}
                                                title={showNewPassword ? 'Hide password' : 'Show password'}
                                                disabled={isSavingPassword}
                                            >
                                                {showNewPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                                            </button>
                                        </div>
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
                                                setShowNewPassword(false);
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
                            Broadcast a private Wi-Fi network for nearby controllers. This temporarily replaces the robot&apos;s current Wi-Fi
                            connection.
                        </p>
                    </div>

                    <div className="space-y-4">
                        {accessPointCredentials.error && (
                            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                                Could not load saved robot network credentials: {String(accessPointCredentials.error)}
                            </p>
                        )}
                        {accessPointStatus.error && (
                            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                                Could not check robot Wi-Fi: {String(accessPointStatus.error)}
                            </p>
                        )}
                        {isAccessPointEnabled && (
                            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-200">
                                <p>
                                    Broadcasting <strong>{accessPointStatus.data?.ssid}</strong>
                                </p>
                                <p className="mt-1">Robot address: {accessPointStatus.data?.ip_address ?? 'No address assigned'}</p>
                                <p className="mt-2">Join this network, then use local discovery or the robot address above.</p>
                            </div>
                        )}
                        {/* Toggle for Access Point Mode */}
                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-slate-300">Broadcast Robot Wi-Fi</span>
                                    {isTogglingAccessPoint && <FaSpinner className="h-4 w-4 animate-spin text-slate-400" />}
                                </div>
                                <span className="mt-1 text-xs text-slate-400">
                                    {accessPointStatus.isPending
                                        ? 'Checking robot Wi-Fi...'
                                        : accessPointStatus.error
                                          ? 'Robot Wi-Fi status is unavailable'
                                          : isAccessPointEnabled
                                            ? 'On - broadcasting robot Wi-Fi'
                                            : 'Off - using normal Wi-Fi'}
                                </span>
                            </div>
                            <label className="relative inline-flex cursor-pointer items-center">
                                <input
                                    type="checkbox"
                                    checked={(isAccessPointEnabled as boolean) ?? false}
                                    onChange={toggleAccessPointMode}
                                    className="peer sr-only"
                                    disabled={isTogglingAccessPoint || isSavingAccessPoint || networkUnavailable}
                                    aria-label="Broadcast Robot Wi-Fi"
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
                                disabled={isSavingAccessPoint || isTogglingAccessPoint || !credentialsReady}
                            />
                            <p className="mt-2 text-xs text-slate-400">The Wi-Fi name shown to nearby devices.</p>
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
                                    disabled={isSavingAccessPoint || isTogglingAccessPoint || !credentialsReady}
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
                            <p className="mt-2 text-xs text-slate-400">Used by devices joining the robot.</p>
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
                                    isSavingAccessPoint ||
                                    networkUnavailable
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
                                        {isAccessPointEnabled ? 'Save and Restart Robot Wi-Fi' : 'Save Robot Network Credentials'}
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
