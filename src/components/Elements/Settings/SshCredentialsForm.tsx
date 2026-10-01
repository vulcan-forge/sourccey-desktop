'use client';

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FaKey, FaSave, FaSpinner } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { markPasswordAsChanged } from '@/hooks/Components/SSH/ssh.hook';

export const DEFAULT_SSH_USERNAME = 'sourccey';
export const DEFAULT_SSH_PASSWORD = 'vulcan';

type Props = {
    onboarding?: boolean;
    onSaved?: () => void;
};

export function SshCredentialsForm({ onboarding = false, onSaved }: Props) {
    const [password, setPassword] = useState(onboarding ? DEFAULT_SSH_PASSWORD : '');
    const [isSaving, setIsSaving] = useState(false);

    const save = async () => {
        if (password.length < 6) return;
        setIsSaving(true);
        try {
            await invoke('set_pi_password', { password });
            await markPasswordAsChanged();
            setPassword('');
            toast.success(onboarding ? 'SSH access configured.' : 'SSH credentials updated.');
            onSaved?.();
        } catch (error) {
            toast.error(`Failed to update SSH credentials: ${String(error)}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <label htmlFor="ssh-username" className="mb-2 block text-sm font-medium text-slate-200">
                    Username
                </label>
                <div
                    id="ssh-username"
                    className="w-full rounded-xl border border-slate-600 bg-slate-950/60 px-4 py-3 font-semibold text-slate-200"
                >
                    {DEFAULT_SSH_USERNAME}
                </div>
                <p className="mt-2 text-xs text-slate-400">The kiosk SSH account username is fixed.</p>
            </div>
            <div>
                <label htmlFor="ssh-password" className="mb-2 block text-sm font-medium text-slate-200">
                    {onboarding ? 'Password' : 'New password'}
                </label>
                <input
                    id="ssh-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    disabled={isSaving}
                    placeholder={onboarding ? undefined : 'Enter a new password'}
                    className="w-full rounded-xl border border-slate-600 bg-slate-950/60 px-4 py-3 text-white focus:border-amber-400 focus:outline-none"
                />
                <p className="mt-2 text-xs text-slate-400">
                    {onboarding
                        ? 'The default password is ready to accept, or you can replace it before continuing.'
                        : 'Your existing password is never displayed or returned by the kiosk.'}
                </p>
            </div>
            <button
                type="button"
                onClick={() => void save()}
                disabled={isSaving || password.length < 6}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isSaving ? <FaSpinner className="animate-spin" /> : onboarding ? <FaKey /> : <FaSave />}
                {isSaving ? 'Saving...' : onboarding ? 'Accept and continue' : 'Update SSH credentials'}
            </button>
        </div>
    );
}
