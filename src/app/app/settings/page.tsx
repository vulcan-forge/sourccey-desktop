'use client';

import { useState, useEffect } from 'react';
import { FaSave, FaTimes } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { markPasswordAsChanged } from '@/hooks/Components/SSH/ssh.hook';
import { toast } from 'react-toastify';

interface SystemInfo {
    ipAddress: string;
    temperature: string;
    batteryData: BatteryData;
}

export interface BatteryData {
    voltage: number;
    percent: number;
}

interface PiCredentials {
    username: string;
}

export default function KioskSettingsPage() {
    const [systemInfo, setSystemInfo] = useState<SystemInfo>({
        ipAddress: '...',
        temperature: '...',
        batteryData: {
            voltage: -1,
            percent: -1,
        },
    });

    const [piCredentials, setPiCredentials] = useState<PiCredentials>({
        username: '...',
    });

    const [isFetchingCreds, setIsFetchingCreds] = useState(false);
    const [isEditingPassword, setIsEditingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [isSavingPassword, setIsSavingPassword] = useState(false);

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

    const handleCancelEdit = () => {
        setIsEditingPassword(false);
        setNewPassword('');
    };

    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto px-8 py-8">
                <div className="mb-8">
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
            </div>
        </div>
    );
}
