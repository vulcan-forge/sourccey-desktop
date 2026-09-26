'use client';

import { LinkButton } from '@/components/Elements/Link/LinkButton';
import { useDesktopAppUpdateStatus } from '@/hooks/System/desktop-app-update.hook';
import { useDesktopEnvironmentSettings } from '@/hooks/System/desktop-environment.hook';
import { useLerobotUpdateStatus } from '@/hooks/System/lerobot-update.hook';

export default function DesktopSettingsPage() {
    const { data: desktopAppUpdateStatus } = useDesktopAppUpdateStatus();
    const { data: lerobotUpdateStatus } = useLerobotUpdateStatus();
    const { data: desktopEnvironmentSettings } = useDesktopEnvironmentSettings();
    const lerobotRuntimeSummary = desktopAppUpdateStatus?.updateAvailable
        ? `App update available: ${desktopAppUpdateStatus.targetVersion ?? 'new version'}`
        : lerobotUpdateStatus?.state === 'update_available'
          ? 'lerobot-vulcan runtime update available'
          : lerobotUpdateStatus?.state === 'custom_build'
            ? 'lerobot-vulcan runtime is on a custom local build'
            : lerobotUpdateStatus?.state === 'unknown'
              ? 'lerobot-vulcan runtime release metadata needs attention'
              : 'Status: No confirmed updates';

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
                                Review desktop app updates and repair or refresh the lerobot-vulcan runtime.
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
                            <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Privacy & Data</div>
                            <p className="mt-2 text-sm text-slate-300">
                                Choose whether Vulcan may receive diagnostics, dataset metadata, trajectories, or camera recordings.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <LinkButton
                                href="/desktop/settings/privacy"
                                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-emerald-500/50 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/70"
                            >
                                Open Privacy & Data
                            </LinkButton>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
