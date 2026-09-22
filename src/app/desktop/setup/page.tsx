'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import Image from 'next/image';
import { Spinner } from '@/components/Elements/Spinner';
import { LinkButton } from '@/components/Elements/Link/LinkButton';
import { useLerobotUpdateStatus } from '@/hooks/System/lerobot-update.hook';
import { useDesktopAppInstallProgress, useDesktopAppUpdateStatus } from '@/hooks/System/desktop-app-update.hook';
import { useDesktopSetupProgress } from '@/hooks/System/desktop-setup-progress.hook';
import { installAvailableDesktopUpdate } from '@/utils/updater/updater';
import { formatLerobotRuntimeVersionLabel, getLerobotRuntimeStatusMessage } from '@/utils/updater/lerobot-runtime';
import { FaArrowRight, FaCheckCircle, FaCloudDownloadAlt, FaExclamationTriangle, FaTools } from 'react-icons/fa';

type SetupStatus = {
    installed: boolean;
    missing: string[];
};

export default function SetupPage() {
    const { data: lerobotStatus, refetch: refetchLerobotStatus, isLoading: isLoadingLerobotStatus } = useLerobotUpdateStatus();
    const {
        data: desktopAppUpdateStatus,
        refetch: refetchDesktopAppUpdateStatus,
        isLoading: isLoadingDesktopAppStatus,
    } = useDesktopAppUpdateStatus();
    const { data: runtimeProgress, refetch: refetchRuntimeProgress } = useDesktopSetupProgress();
    const appInstallProgress = useDesktopAppInstallProgress();

    const [isReady, setIsReady] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [showRuntimeSteps, setShowRuntimeSteps] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [log, setLog] = useState<string[]>([]);
    const hasMarkedInstalledRef = useRef(false);
    const wasRuntimeRunningRef = useRef(false);

    const formatLogLine = useCallback((message: string) => `[${new Date().toLocaleTimeString()}] ${message}`, []);
    const appendLog = useCallback((message: string) => setLog((previous) => [...previous, formatLogLine(message)]), [formatLogLine]);

    const getErrorMessage = useCallback((value: unknown) => {
        if (typeof value === 'string') return value;
        if (value instanceof Error) return value.message;
        if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
            return value.message;
        }
        return 'Setup failed.';
    }, []);

    const markInstalled = useCallback((message: string) => {
        if (hasMarkedInstalledRef.current) return;
        hasMarkedInstalledRef.current = true;
        setIsInstalled(true);
        setLog((previous) => (previous.length > 0 ? previous : [message]));
    }, []);

    useEffect(() => {
        if (!runtimeProgress?.action) return;
        setIsRunning(runtimeProgress.running);
        setShowRuntimeSteps(true);
        setLog(runtimeProgress.log);
        setError(runtimeProgress.error ?? null);
        if (wasRuntimeRunningRef.current && !runtimeProgress.running) {
            void Promise.all([refetchLerobotStatus(), refetchDesktopAppUpdateStatus()]);
            if (!runtimeProgress.error) setIsInstalled(true);
        }
        wasRuntimeRunningRef.current = runtimeProgress.running;
    }, [refetchDesktopAppUpdateStatus, refetchLerobotStatus, runtimeProgress]);

    useEffect(() => {
        const checkSetup = async () => {
            if (!isTauri()) {
                markInstalled('Setup already complete.');
                setIsReady(true);
                return;
            }

            try {
                const status = await invoke<SetupStatus>('setup_check');
                setIsInstalled(status.installed);
                if (status.installed) markInstalled('Setup already complete.');
            } catch (setupError) {
                console.error('Setup status check failed:', setupError);
            } finally {
                setIsReady(true);
            }
        };

        void checkSetup();
    }, [markInstalled]);

    const runSetup = async (action: 'repair' | 'update') => {
        setShowRuntimeSteps(true);
        setIsRunning(true);
        setError(null);
        setLog([]);

        try {
            await invoke('desktop_setup_start', { action, force: isInstalled });
            await refetchRuntimeProgress();
        } catch (setupError) {
            const message = getErrorMessage(setupError);
            setError(message);
            setIsRunning(false);
            appendLog(message);
        }
    };

    const installAppUpdate = async () => {
        const targetVersion = desktopAppUpdateStatus?.targetVersion ?? null;
        if (!targetVersion || appInstallProgress.running || isRunning) return;

        try {
            await installAvailableDesktopUpdate({ expectedVersion: targetVersion });
        } finally {
            await refetchDesktopAppUpdateStatus();
        }
    };

    const runtimeCurrent = formatLerobotRuntimeVersionLabel(lerobotStatus?.currentTag, lerobotStatus?.currentCommit);
    const runtimeAvailable = formatLerobotRuntimeVersionLabel(lerobotStatus?.latestTag, lerobotStatus?.latestCommit);
    const runtimeState = lerobotStatus?.state ?? 'unknown';
    const runtimeOutdated = runtimeState === 'update_available';
    const runtimeError = runtimeState === 'unknown';
    const runtimeStatusMessage = getLerobotRuntimeStatusMessage(lerobotStatus, isLoadingLerobotStatus);

    const appCurrent = formatLerobotRuntimeVersionLabel(desktopAppUpdateStatus?.currentVersion, null);
    const appAvailable = formatLerobotRuntimeVersionLabel(desktopAppUpdateStatus?.targetVersion, null);
    const appError = desktopAppUpdateStatus?.error?.trim() || null;
    const appOutdated = Boolean(desktopAppUpdateStatus?.updateAvailable && desktopAppUpdateStatus?.targetVersion);
    const appStatusMessage = isLoadingDesktopAppStatus
        ? 'Checking for a desktop app update...'
        : appError
          ? 'The desktop update check could not be completed.'
          : appOutdated
            ? `Version ${appAvailable} is ready to install.`
            : 'Your desktop app is up to date.';
    const runtimeAction = !isInstalled ? 'repair' : runtimeOutdated ? 'update' : 'repair';
    const runtimeNeedsAction = !isInstalled || runtimeOutdated;
    const runtimePercent = (() => {
        if (!runtimeProgress?.running) return 0;
        if (runtimeProgress.step === 'deps' && runtimeProgress.stepStartedAt) {
            const elapsed = Math.max(0, Date.now() - runtimeProgress.stepStartedAt);
            return Math.min(89, Math.max(runtimeProgress.percent, 52 + Math.floor((elapsed / (40 * 60 * 1000)) * 37)));
        }
        return runtimeProgress.percent;
    })();
    const setupIsCurrent =
        !isRunning &&
        !appInstallProgress.running &&
        !isLoadingDesktopAppStatus &&
        !isLoadingLerobotStatus &&
        !appError &&
        !appOutdated &&
        isInstalled &&
        !runtimeError &&
        !runtimeOutdated;
    const runtimeButtonLabel = isRunning
        ? !isInstalled
            ? `Installing runtime… ~${runtimePercent}%`
            : runtimeOutdated
              ? `Updating runtime… ~${runtimePercent}%`
              : `Repairing runtime… ~${runtimePercent}%`
        : !isInstalled
          ? 'Install runtime'
          : runtimeOutdated
            ? `Update runtime${runtimeAvailable === 'unknown' ? '' : ` to ${runtimeAvailable}`}`
            : 'Repair runtime';

    if (!isReady) {
        return <div className="min-h-screen bg-linear-to-br from-slate-800 via-slate-700 to-slate-800" />;
    }

    return (
        <div className="min-h-screen w-full overflow-y-auto bg-linear-to-br from-slate-800 via-slate-700 to-slate-800">
            <main className="mx-auto w-full max-w-3xl px-6 py-10">
                <div className="rounded-3xl border border-slate-600/70 bg-slate-900/80 p-6 shadow-2xl backdrop-blur sm:p-8">
                    <header className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <Image
                                src="/assets/logo/SourcceyLogo.png"
                                alt="Sourccey Logo"
                                width={52}
                                height={52}
                                className="drop-shadow-logo"
                            />
                            <div>
                                <h1 className="text-2xl font-semibold text-white sm:text-3xl">Desktop Setup & Updates</h1>
                                <p className="mt-1 text-sm text-slate-300">The app and robot runtime update separately.</p>
                            </div>
                        </div>
                        <LinkButton
                            href="/desktop/"
                            className="cursor-pointer rounded-lg border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-300"
                        >
                            Back to home
                        </LinkButton>
                    </header>

                    {setupIsCurrent && (
                        <section className="mt-7 overflow-hidden rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-5 shadow-[0_18px_45px_rgba(16,185,129,0.12)] sm:p-6">
                            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-200">
                                        <FaCheckCircle className="h-5 w-5" />
                                        Setup complete
                                    </div>
                                    <h2 className="mt-2 text-2xl font-semibold text-white">Your desktop is ready</h2>
                                    <p className="mt-1 text-sm text-slate-300">Vulcan Studio and the robot runtime are both up to date.</p>
                                </div>
                                <LinkButton
                                    href="/desktop/"
                                    className="inline-flex min-h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-7 py-4 text-base font-bold text-white shadow-lg shadow-emerald-950/30 transition hover:from-emerald-400 hover:to-teal-400 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none sm:w-auto"
                                >
                                    Enter Studio
                                    <FaArrowRight className="h-4 w-4" />
                                </LinkButton>
                            </div>
                        </section>
                    )}

                    <div className="mt-7 grid gap-4">
                        <section className="rounded-2xl border border-slate-700 bg-slate-950/45 p-5 sm:p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Section 1</p>
                                    <h2 className="mt-1 text-xl font-semibold text-white">Vulcan Studio app</h2>
                                </div>
                                <StatusBadge loading={isLoadingDesktopAppStatus} warning={Boolean(appError)} updateAvailable={appOutdated} />
                            </div>

                            <p className={`mt-4 text-sm ${appError ? 'text-red-200' : appOutdated ? 'text-amber-200' : 'text-emerald-200'}`}>
                                {appStatusMessage}
                            </p>
                            <VersionSummary installed={appCurrent} latest={appAvailable} />
                            {appError && <p className="mt-2 text-xs break-words text-red-200">{appError}</p>}

                            <button
                                type="button"
                                onClick={() => void installAppUpdate()}
                                disabled={!appOutdated || appInstallProgress.running || isRunning}
                                className="mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-yellow-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-yellow-500/20 transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400"
                            >
                                {appInstallProgress.running ? (
                                    <Spinner color="white" width="w-4" height="h-4" />
                                ) : appOutdated ? (
                                    <FaCloudDownloadAlt />
                                ) : (
                                    <FaCheckCircle />
                                )}
                                {appInstallProgress.running
                                    ? `Installing app update… ${appInstallProgress.percent}%`
                                    : appOutdated
                                      ? `Update app to ${appAvailable}`
                                      : 'App is up to date'}
                            </button>

                            {(appInstallProgress.running || appInstallProgress.logs.length > 0) && (
                                <ProgressLog title="Live app update output" running={appInstallProgress.running} lines={appInstallProgress.logs} />
                            )}
                        </section>

                        <section className="rounded-2xl border border-slate-700 bg-slate-950/45 p-5 sm:p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Section 2</p>
                                    <h2 className="mt-1 text-xl font-semibold text-white">Robot runtime</h2>
                                </div>
                                <StatusBadge
                                    loading={isLoadingLerobotStatus}
                                    warning={runtimeError}
                                    updateAvailable={!isInstalled || runtimeOutdated}
                                    installed={isInstalled}
                                />
                            </div>

                            <p
                                className={`mt-4 text-sm ${runtimeError ? 'text-slate-300' : runtimeOutdated || !isInstalled ? 'text-amber-200' : 'text-emerald-200'}`}
                            >
                                {!isInstalled
                                    ? runtimeCurrent === 'unknown'
                                        ? `No robot runtime is installed. Install${runtimeAvailable === 'unknown' ? ' the latest version' : ` version ${runtimeAvailable}`}.`
                                        : `Runtime files for version ${runtimeCurrent} were downloaded, but setup is not complete. Finish setup to use them.`
                                    : runtimeStatusMessage}
                            </p>
                            <VersionSummary
                                installed={runtimeCurrent}
                                latest={runtimeAvailable}
                                installedLabel={isInstalled ? 'Installed' : 'Downloaded'}
                            />

                            <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                                <FaExclamationTriangle className="mr-2 inline text-amber-300" />
                                Runtime installation or updates can take 40 minutes or longer. Keep Vulcan Studio open and the computer powered on.
                            </div>

                            <div className={`mt-5 ${runtimeNeedsAction ? '' : 'flex flex-wrap items-center justify-between gap-3'}`}>
                                {!runtimeNeedsAction && (
                                    <p className="text-xs text-slate-400">
                                        Only repair the runtime if robot features are not working correctly.
                                    </p>
                                )}
                                <button
                                    type="button"
                                    onClick={() => void runSetup(runtimeAction)}
                                    disabled={isRunning || appInstallProgress.running}
                                    className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400 ${
                                        runtimeNeedsAction
                                            ? 'w-full bg-orange-500 px-5 py-3 font-bold text-white hover:bg-orange-400'
                                            : 'border border-slate-600 bg-transparent px-4 py-2 text-slate-300 hover:border-slate-400 hover:bg-slate-800/70 hover:text-white'
                                    }`}
                                >
                                    {isRunning ? <Spinner color="white" width="w-4" height="h-4" /> : <FaTools />}
                                    {runtimeButtonLabel}
                                </button>
                            </div>

                            {showRuntimeSteps && (
                                <div className="mt-5 border-t border-slate-700 pt-5">
                                    <h3 className="text-sm font-semibold text-slate-100">Live runtime output</h3>
                                    <ProgressLog title="Command logs" running={isRunning} lines={log} />
                                </div>
                            )}
                        </section>
                    </div>

                    {error && (
                        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
                    )}
                </div>
            </main>
        </div>
    );
}

function StatusBadge({
    loading,
    warning,
    updateAvailable,
    installed = true,
}: {
    loading: boolean;
    warning: boolean;
    updateAvailable: boolean;
    installed?: boolean;
}) {
    const label = loading
        ? 'Checking'
        : warning
          ? 'Check unavailable'
          : !installed
            ? 'Setup required'
            : updateAvailable
              ? 'Update available'
              : 'Up to date';
    const color = warning
        ? 'border-slate-500/40 bg-slate-500/10 text-slate-300'
        : updateAvailable
          ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
          : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';

    return (
        <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${color}`}>
            {warning && <FaExclamationTriangle className="mr-1.5 inline" />}
            {label}
        </span>
    );
}

function ProgressLog({ title, running, lines }: { title: string; running: boolean; lines: string[] }) {
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (running) logEndRef.current?.scrollIntoView({ block: 'nearest' });
    }, [lines.length, running]);

    return (
        <div className="mt-4 rounded-xl border border-slate-700 bg-black/30 p-3">
            <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                <span>{title}</span>
                {running && <span className="animate-pulse text-amber-300">Streaming</span>}
            </div>
            <div className="mt-2 max-h-96 min-h-48 space-y-1 overflow-y-auto font-mono text-[11px] text-slate-200">
                {lines.length === 0 && <div className="text-slate-500">Waiting for command output...</div>}
                {lines.map((line, index) => (
                    <div key={`${line}-${index}`} className="break-words whitespace-pre-wrap">
                        {line}
                    </div>
                ))}
                <div ref={logEndRef} />
            </div>
        </div>
    );
}

function VersionSummary({ installed, latest, installedLabel = 'Installed' }: { installed: string; latest: string; installedLabel?: string }) {
    return (
        <div className="mt-4 grid grid-cols-2 divide-x divide-slate-700 rounded-xl border border-slate-700 bg-slate-900/70">
            <div className="px-4 py-3">
                <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{installedLabel}</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-100">{installed}</p>
            </div>
            <div className="px-4 py-3">
                <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Latest</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-100">{latest}</p>
            </div>
        </div>
    );
}
