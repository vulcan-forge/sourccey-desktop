'use client';

import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import Link from 'next/link';

export default function DesktopSettingsLogsPage() {
    const [logDir, setLogDir] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [frontendLogs, setFrontendLogs] = useState<string[]>([]);
    const [frontendLogError, setFrontendLogError] = useState<string>('');
    const [isLoadingFrontendLogs, setIsLoadingFrontendLogs] = useState<boolean>(false);

    const getErrorMessage = (err: unknown) => {
        if (err instanceof Error) {
            return err.message;
        }
        return String(err ?? 'Unknown error');
    };

    const loadFrontendLogs = async () => {
        if (!isTauri()) {
            setFrontendLogError('Frontend logs are only available in the desktop app.');
            return;
        }

        setIsLoadingFrontendLogs(true);
        setFrontendLogError('');

        try {
            const logs = (await invoke('get_frontend_log_tail', { max_lines: 200 })) as string[];
            setFrontendLogs(logs);
        } catch (err) {
            setFrontendLogError(`Failed to load frontend logs: ${getErrorMessage(err)}`);
        } finally {
            setIsLoadingFrontendLogs(false);
        }
    };

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
                setError(`Unable to resolve log directory: ${getErrorMessage(err)}`);
            }
        };

        void loadPath();
        void loadFrontendLogs();
    }, []);

    const handleOpenLogs = async () => {
        if (!isTauri()) {
            setError('Log folder is only available in the desktop app.');
            return;
        }

        try {
            const dir = logDir || ((await invoke('get_log_dir')) as string);
            const normalizedDir = dir.replace(/\\/g, '/');
            console.log('Log directory:', normalizedDir);
            setLogDir(dir);
            await openPath(normalizedDir);
        } catch (err) {
            console.error('Failed to open log directory:', err);
            setError(`Failed to open the log folder: ${getErrorMessage(err)}`);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto flex flex-col gap-8 px-8 py-10">
                <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-10 shadow-2xl">
                    <div className="flex flex-col gap-3">
                        <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Settings</div>
                        <h1 className="text-3xl font-semibold text-white">Logs</h1>
                        <p className="text-sm text-slate-300">
                            Review local log files and recent frontend console output.
                        </p>
                        <div>
                            <Link
                                href="/desktop/settings"
                                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
                            >
                                Back to Settings
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-xl">
                    <div className="flex flex-col gap-4">
                        <div>
                            <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Logs Folder</div>
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

                <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-xl">
                    <div className="flex flex-col gap-4">
                        <div>
                            <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">App Logs</div>
                            <p className="mt-2 text-sm text-slate-300">
                                Recent frontend console output captured in production builds.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={loadFrontendLogs}
                                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
                            >
                                {isLoadingFrontendLogs ? 'Loading...' : 'Refresh'}
                            </button>
                        </div>
                        {frontendLogError && <div className="text-sm text-red-300">{frontendLogError}</div>}
                        <div className="h-64 overflow-auto rounded-xl border border-slate-700/60 bg-slate-950/60 px-4 py-3 text-xs text-slate-200">
                            {frontendLogs.length === 0 ? (
                                <div className="text-slate-400">No frontend logs yet.</div>
                            ) : (
                                frontendLogs.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
