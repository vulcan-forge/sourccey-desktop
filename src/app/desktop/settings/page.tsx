'use client';

import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';

export default function DesktopSettingsPage() {
    const [logDir, setLogDir] = useState<string>('');
    const [error, setError] = useState<string>('');

    useEffect(() => {
        const loadPath = async () => {
            if (!isTauri()) {
                return;
            }

            try {
                const dir = (await invoke('get_log_dir')) as string;
                setLogDir(dir);
            } catch (err) {
                console.error('Failed to load log directory:', err);
                setError('Unable to resolve log directory.');
            }
        };

        void loadPath();
    }, []);

    const handleOpenLogs = async () => {
        if (!isTauri()) {
            setError('Log folder is only available in the desktop app.');
            return;
        }

        try {
            const dir = logDir || ((await invoke('get_log_dir')) as string);
            setLogDir(dir);
            await openPath(dir);
        } catch (err) {
            console.error('Failed to open log directory:', err);
            setError('Failed to open the log folder.');
        }
    };

    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto flex flex-col gap-8 px-8 py-10">
                <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-10 shadow-2xl">
                    <div className="flex flex-col gap-3">
                        <h1 className="text-3xl font-semibold text-white">Settings</h1>
                        <p className="text-sm text-slate-300">Access diagnostics and local resources for the Sourccey desktop app.</p>
                    </div>
                </div>

                <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-xl">
                    <div className="flex flex-col gap-4">
                        <div>
                            <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Logs</div>
                            <p className="mt-2 text-sm text-slate-300">Open the local logs folder to inspect pairing and runtime errors.</p>
                        </div>
                        {logDir && (
                            <div className="rounded-xl border border-slate-700/60 bg-slate-950/60 px-4 py-3 text-xs text-slate-300">
                                {logDir}
                            </div>
                        )}
                        {error && <div className="text-sm text-red-300">{error}</div>}
                        <div>
                            <button
                                type="button"
                                onClick={handleOpenLogs}
                                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
                            >
                                Open Logs Folder
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
