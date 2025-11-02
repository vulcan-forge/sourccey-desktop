'use client';

import React, { useState } from 'react';
import { FaSave } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { markPasswordAsChanged, usePasswordChangedStatus } from '@/hooks/Components/SSH/ssh.hook';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { toast } from 'react-toastify';

export default function FirstTimePasswordModal() {
    const { data: hasPasswordBeenChanged } = usePasswordChangedStatus();
    const { isKioskMode, isLoading: isLoadingAppMode } = useAppMode();
    const [newPassword, setNewPassword] = useState('');
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const [username, setUsername] = useState('...');

    // Fetch username when modal opens
    React.useEffect(() => {
        if (!hasPasswordBeenChanged && isKioskMode) {
            const fetchUsername = async () => {
                try {
                    const fetchedUsername = await invoke<string>('get_pi_username');
                    setUsername(fetchedUsername);
                } catch (error) {
                    console.error('Failed to fetch username:', error);
                    setUsername('sourccey');
                }
            };
            fetchUsername();
        }
    }, [hasPasswordBeenChanged, isKioskMode]);

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
        setNewPassword(pwd);
    };

    const handleSavePassword = async () => {
        if (!newPassword.trim()) return;

        setIsSavingPassword(true);
        try {
            await invoke('set_pi_password', { username, password: newPassword });
            
            // Mark password as changed in persistent storage (now async)
            await markPasswordAsChanged();
            
            toast.success('Password set successfully!');
        } catch (error) {
            console.error('Failed to save password:', error);
            toast.error(`Failed to save password: ${error}`);
        } finally {
            setIsSavingPassword(false);
        }
    };

    // Don't render modal if password has already been changed or if not in kiosk mode
    if (hasPasswordBeenChanged || !isKioskMode || isLoadingAppMode) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pt-8">
            <div className="w-full max-w-2xl rounded-2xl border-2 border-slate-700 bg-slate-800 p-8 shadow-2xl">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-white">Set Up Your Password</h2>
                    <p className="mt-2 text-sm text-slate-300">
                        Before you continue, please set a password for SSH and system access.
                    </p>
                </div>

                <div className="mb-6 rounded-lg border border-blue-600 bg-blue-900/20 p-4">
                    <p className="text-sm text-blue-300">
                        <strong>Note:</strong> This password will be used for SSH access and sudo commands. Write it down in a
                        safe place. You can always regenerate it from the Kiosk Settings page.
                    </p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-slate-300">Username</label>
                        <div className="rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3">
                            <span className="text-sm font-semibold text-slate-200">{username}</span>
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-slate-300">Password</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter password (min 8 characters)"
                                autoComplete="off"
                                className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-4 py-3 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/30"
                                disabled={isSavingPassword}
                            />
                            <button
                                onClick={handleRandomizePassword}
                                disabled={isSavingPassword}
                                className="rounded-lg bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Generate Random
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4">
                        <button
                            onClick={handleSavePassword}
                            disabled={!newPassword.trim() || isSavingPassword}
                            className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <FaSave className="h-4 w-4" />
                            {isSavingPassword ? 'Saving...' : 'Set Password'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

