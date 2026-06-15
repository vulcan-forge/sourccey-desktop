'use client';

import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { LinkButton } from '@/components/Elements/Link/LinkButton';
import { AIRuntimeCard } from '@/components/Elements/Setup/AIRuntimeCard';
import { useDesktopAppUpdateStatus } from '@/hooks/System/desktop-app-update.hook';
import { useDesktopEnvironmentSettings } from '@/hooks/System/desktop-environment.hook';
import { useLerobotUpdateStatus } from '@/hooks/System/lerobot-update.hook';

export default function DesktopSettingsPage() {
    const [baseInstalled, setBaseInstalled] = useState(false);
    const [baseMissing, setBaseMissing] = useState<string[]>([]);
    const [baseError, setBaseError] = useState('');
    const { data: desktopAppUpdateStatus } = useDesktopAppUpdateStatus();
    const { data: lerobotUpdateStatus } = useLerobotUpdateStatus();
    const { data: desktopEnvironmentSettings } = useDesktopEnvironmentSettings();
    const lerobotRuntimeSummary = desktopAppUpdateStatus?.updateAvailable
        ? `App update available: ${desktopAppUpdateStatus.targetVersion ?? 'new version'}`
        : lerobotUpdateStatus?.state === 'update_available'
          ? 'LeRobot runtime update available'
          : lerobotUpdateStatus?.state === 'custom_build'
            ? 'LeRobot runtime is on a custom local build'
            : lerobotUpdateStatus?.state === 'unknown'
              ? 'LeRobot release metadata needs attention'
              : 'Status: No confirmed updates';

    useEffect(() => {
        const loadBaseStatus = async () => {
            if (!isTauri()) {
                setBaseInstalled(true);
                setBaseMissing([]);
                return;
            }
            try {
                const status = (await invoke('setup_check')) as { installed: boolean; missing: string[] };
                setBaseInstalled(status.installed);
                setBaseMissing(status.missing ?? []);
                setBaseError('');
            } catch (error) {
                console.error('Failed to check base setup status:', error);
                setBaseInstalled(false);
                setBaseError('Failed to check base setup status.');
            }
        };
        void loadBaseStatus();
    }, []);

    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto flex flex-col gap-8 px-8 py-10">
                <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-10 shadow-2xl">
                    <div className="flex flex-col gap-3">
                        <h1 className="text-3xl font-semibold text-white">Settings</h1>
                        <p className="text-sm text-slate-300">Access diagnostics, update tools, and runtime environment controls for Vulcan Studio.</p>
                    </div>
                </div>

                <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-xl">
                    <div className="flex flex-col gap-4">
                        <div>
                            <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Logs</div>
                            <p className="mt-2 text-sm text-slate-300">
                                View recent telemetry and diagnostics from the desktop app.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <LinkButton
                                href="/desktop/settings/logs"
                                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
                            >
                                Open Logs
                            </LinkButton>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-xl">
                    <div className="flex flex-col gap-4">
                        <div>
                            <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Desktop Updates</div>
                            <p className="mt-2 text-sm text-slate-300">
                                Review desktop app updates and repair or refresh the LeRobot runtime.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <LinkButton
                                href="/desktop/setup"
                                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-amber-500/50 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-400/70"
                            >
                                Open Desktop Updates
                            </LinkButton>
                            <div className="text-xs text-slate-400">{lerobotRuntimeSummary}</div>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-xl">
                    <div className="flex flex-col gap-4">
                        <div>
                            <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Base Setup</div>
                            <p className="mt-2 text-sm text-slate-300">
                                Download lerobot-vulcan, create the Python environment, and compile protobufs.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <LinkButton
                                href="/desktop/setup"
                                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
                            >
                                Open Base Setup
                            </LinkButton>
                            <div className="text-xs text-slate-400">{baseInstalled ? 'Status: Installed' : 'Status: Not installed'}</div>
                        </div>
                        {baseMissing.length > 0 && (
                            <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-400">
                                {`Missing: ${baseMissing.join(', ')}`}
                            </div>
                        )}
                        {baseError && <div className="text-sm text-red-300">{baseError}</div>}
                    </div>
                </div>

                <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-xl">
                    <div className="flex flex-col gap-4">
                        <div>
                            <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Developer Settings</div>
                            <p className="mt-2 text-sm text-slate-300">
                                Switch desktop cloud endpoints between production, staging, and developer mode without rebuilding.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <LinkButton
                                href="/desktop/settings/developer"
                                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
                            >
                                Open Developer Settings
                            </LinkButton>
                            <div className="text-xs text-slate-400">
                                Active environment: {desktopEnvironmentSettings?.displayName ?? 'Loading...'}
                            </div>
                        </div>
                    </div>
                </div>

                <AIRuntimeCard showSettingsLink={false} />
            </div>
        </div>
    );
}
