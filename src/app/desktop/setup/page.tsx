'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/Elements/Spinner';
import { LinkButton } from '@/components/Elements/Link/LinkButton';
import { useLerobotUpdateStatus } from '@/hooks/System/lerobot-update.hook';
import { useDesktopAppUpdateStatus } from '@/hooks/System/desktop-app-update.hook';
import { installAvailableDesktopUpdate } from '@/utils/updater/updater';
import {
    formatLerobotRuntimeVersionLabel,
    getLerobotRuntimeStatusMessage,
} from '@/utils/updater/lerobot-runtime';

const steps = [
    { id: 'reset', label: 'Reset modules' },
    { id: 'download', label: 'Download lerobot-vulcan' },
    { id: 'extract', label: 'Extract modules' },
    { id: 'uv', label: 'Install uv runtime' },
    { id: 'venv', label: 'Create environment' },
    { id: 'deps', label: 'Install dependencies' },
    { id: 'protobuf', label: 'Compile protobuf' },
    { id: 'complete', label: 'Finalize setup' },
];

type StepStatus = 'pending' | 'started' | 'success' | 'error';

type SetupProgress = {
    step: string;
    status: string;
    message?: string | null;
};

type SetupStatus = {
    installed: boolean;
    missing: string[];
};

const statusColors: Record<StepStatus, string> = {
    pending: 'text-slate-400',
    started: 'text-amber-300',
    success: 'text-emerald-300',
    error: 'text-red-300',
};

export default function SetupPage() {
    const router = useRouter();
    const { data: lerobotStatus, refetch: refetchLerobotStatus, isLoading: isLoadingLerobotStatus } = useLerobotUpdateStatus();
    const { data: desktopAppUpdateStatus, refetch: refetchDesktopAppUpdateStatus, isLoading: isLoadingDesktopAppStatus } = useDesktopAppUpdateStatus();

    const [isReady, setIsReady] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [isInstallingAppUpdate, setIsInstallingAppUpdate] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [log, setLog] = useState<string[]>([]);
    const [appUpdateLog, setAppUpdateLog] = useState<string[]>([]);
    const hasMarkedInstalledRef = useRef(false);
    const [stepState, setStepState] = useState<Record<string, StepStatus>>(() => {
        const initial: Record<string, StepStatus> = {};
        steps.forEach((step) => {
            initial[step.id] = 'pending';
        });
        return initial;
    });

    const orderedSteps = useMemo(() => steps, []);

    const formatLogLine = useCallback((message: string) => `[${new Date().toLocaleTimeString()}] ${message}`, []);

    const appendLog = useCallback((message: string) => {
        setLog((prev) => [...prev, formatLogLine(message)]);
    }, [formatLogLine]);

    const appendAppUpdateLog = useCallback((message: string) => {
        setAppUpdateLog((prev) => [...prev, formatLogLine(message)]);
    }, [formatLogLine]);

    const getErrorMessage = useCallback((err: unknown) => {
        if (typeof err === 'string') {
            return err;
        }
        if (err instanceof Error) {
            return err.message;
        }
        if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
            return err.message;
        }
        try {
            return JSON.stringify(err, null, 2);
        } catch {
            return 'Setup failed.';
        }
    }, []);

    const updateStep = useCallback(
        (step: string, status: StepStatus, message?: string | null) => {
            setStepState((prev) => ({
                ...prev,
                [step]: status,
            }));
            if (message) {
                appendLog(message);
            }
            if (step === 'complete' && status === 'success') {
                setIsComplete(true);
            }
        },
        [appendLog]
    );

    const markInstalled = useCallback((message: string) => {
        if (hasMarkedInstalledRef.current) {
            return;
        }
        hasMarkedInstalledRef.current = true;
        setIsInstalled(true);
        setIsComplete(true);
        setStepState((prev) => {
            const next = { ...prev };
            steps.forEach((step) => {
                next[step.id] = 'success';
            });
            return next;
        });
        setLog((prev) => (prev.length > 0 ? prev : [message]));
    }, []);

    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        let cancelled = false;
        const startListener = async () => {
            unlisten = await listen<SetupProgress>('setup:progress', (event) => {
                const { step, status, message } = event.payload;
                if (status === 'log') {
                    if (message) {
                        appendLog(message);
                    }
                    return;
                }
                const mapped: StepStatus =
                    status === 'started' ? 'started' : status === 'success' ? 'success' : status === 'error' ? 'error' : 'pending';
                const stepLabel = steps.find((candidate) => candidate.id === step)?.label ?? step;
                updateStep(step, mapped, message ?? `${stepLabel}: ${mapped}`);
                if (status === 'error' && message) {
                    setError(message);
                    setIsRunning(false);
                }
            });
            if (cancelled && unlisten) {
                unlisten();
            }
        };

        void startListener();
        return () => {
            cancelled = true;
            if (unlisten) {
                unlisten();
            }
        };
    }, [appendLog, updateStep]);

    useEffect(() => {
        const check = async () => {
            if (!isTauri()) {
                markInstalled('Setup already complete.');
                setIsReady(true);
                return;
            }

            try {
                const status = (await invoke('setup_check')) as SetupStatus;
                setIsInstalled(status.installed);
                if (status.installed) {
                    markInstalled('Setup already complete.');
                }
            } catch (err) {
                console.error('Setup status check failed:', err);
            }
            setIsReady(true);
        };

        void check();
    }, [markInstalled, router]);

    const runSetup = async (action: 'repair' | 'update') => {
        setIsRunning(true);
        setError(null);
        setLog([]);
        setIsComplete(false);
        setStepState((prev) => {
            const reset = { ...prev };
            Object.keys(reset).forEach((key) => {
                reset[key] = 'pending';
            });
            if (action === 'repair' && isInstalled) {
                reset['reset'] = 'success';
            }
            return reset;
        });
        appendLog(
            action === 'update'
                ? 'Starting full runtime update: remove, download, verify, extract, and reinstall.'
                : isInstalled
                  ? 'Starting runtime repair: preserve source files and refresh the environment.'
                  : 'Starting initial runtime installation.'
        );

        try {
            if (action === 'update') {
                await invoke('setup_reset');
            } else {
                await invoke('setup_run', { force: isInstalled });
            }
            appendLog(action === 'update' ? 'Runtime update completed successfully.' : 'Runtime setup completed successfully.');
            await refetchLerobotStatus();
            await refetchDesktopAppUpdateStatus();
            setIsRunning(false);
            if (action === 'repair' && isInstalled) {
                setStepState((prev) => ({
                    ...prev,
                    reset: 'success',
                }));
            }
            markInstalled('Setup complete. Ready to continue.');
        } catch (err) {
            const message = getErrorMessage(err);
            setError(message);
            setIsRunning(false);
            appendLog(message);
        }
    };

    const installAppUpdate = async () => {
        const targetVersion = desktopAppUpdateStatus?.targetVersion ?? null;
        if (!targetVersion || isInstallingAppUpdate) {
            return;
        }

        setIsInstallingAppUpdate(true);
        setAppUpdateLog([]);
        appendAppUpdateLog(`Preparing to install desktop app ${targetVersion}.`);
        try {
            await installAvailableDesktopUpdate({
                expectedVersion: targetVersion,
                onLog: appendAppUpdateLog,
            });
        } finally {
            setIsInstallingAppUpdate(false);
            await refetchDesktopAppUpdateStatus();
        }
    };

    const formatVersionLabel = (tag?: string | null, commit?: string | null) =>
        formatLerobotRuntimeVersionLabel(tag, commit);

    const runtimeCurrent = formatVersionLabel(lerobotStatus?.currentTag, lerobotStatus?.currentCommit);
    const runtimeAvailable = formatVersionLabel(lerobotStatus?.latestTag, lerobotStatus?.latestCommit);
    const runtimeState = lerobotStatus?.state ?? 'unknown';
    const runtimeOutdated = runtimeState === 'update_available';
    const runtimeStatusMessage = getLerobotRuntimeStatusMessage(lerobotStatus, isLoadingLerobotStatus);

    const appCurrent = formatVersionLabel(desktopAppUpdateStatus?.currentVersion, null);
    const appAvailable = formatVersionLabel(desktopAppUpdateStatus?.targetVersion, null);
    const appMetadataKnown = appCurrent !== 'unknown' && appAvailable !== 'unknown';
    const appError = desktopAppUpdateStatus?.error?.trim() || null;
    const appOutdated = Boolean(desktopAppUpdateStatus?.updateAvailable && desktopAppUpdateStatus?.targetVersion);
    const appStatusMessage = isLoadingDesktopAppStatus
        ? 'Checking app version status...'
        : appError
          ? 'Update check returned warnings. See details below.'
          : !appMetadataKnown
            ? 'Unable to resolve app version metadata from latest.json yet.'
            : appOutdated
              ? 'Out of date because a newer signed app version is available.'
              : 'Up to date. You are on the latest app version.';

    if (!isReady) {
        return <div className="min-h-screen bg-linear-to-br from-slate-800 via-slate-700 to-slate-800" />;
    }

    return (
        <div className="flex h-screen w-full overflow-y-auto bg-linear-to-br from-slate-800 via-slate-700 to-slate-800">
            <div className="container mx-auto flex min-h-full flex-col items-center justify-start px-6 py-12">
                <div className="relative w-full max-w-3xl">
                    <div className="absolute -top-20 -left-16 h-36 w-36 rounded-full bg-red-400/30 blur-3xl" />
                    <div className="absolute -right-16 -bottom-16 h-36 w-36 rounded-full bg-amber-300/30 blur-3xl" />

                    <div className="relative rounded-3xl border border-slate-600/70 bg-slate-900/75 p-8 shadow-2xl backdrop-blur">
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <Image
                                        src="/assets/logo/SourcceyLogo.png"
                                        alt="Sourccey Logo"
                                        width={56}
                                        height={56}
                                        className="drop-shadow-logo"
                                    />
                                    <div>
                                        <h1 className="text-3xl font-semibold text-white">Desktop Setup & Updates</h1>
                                        <p className="mt-1 text-sm text-slate-200">App update on top and LeRobot runtime below for the same flow as kiosk.</p>
                                    </div>
                                </div>
                                <LinkButton
                                    href="/desktop/"
                                    className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-500/80 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-300"
                                >
                                    Back to home
                                </LinkButton>
                            </div>

                            <div className="rounded-2xl border border-amber-500/45 bg-slate-950/50 p-6">
                                <h2 className="mb-1 text-lg font-semibold text-amber-100">App Update</h2>
                                <p className="mb-4 text-xs text-amber-200/90">
                                    Install the latest signed desktop app update while keeping the current top-bar update chip behavior.
                                </p>
                                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                                    <div className="font-semibold text-amber-100">App version status</div>
                                    <div className="mt-1 text-amber-100/90">Current: {appCurrent}</div>
                                    <div className="text-amber-100/90">Available: {appAvailable}</div>
                                    <div className={`mt-2 text-[11px] ${appOutdated ? 'text-amber-100' : 'text-emerald-200'}`}>{appStatusMessage}</div>
                                    {appError && (
                                        <div className="mt-2 whitespace-pre-wrap break-words text-[11px] text-red-200">{appError}</div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void installAppUpdate()}
                                    disabled={!appOutdated || isInstallingAppUpdate}
                                    className="mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-amber-500/60 bg-amber-500/10 px-6 py-3 text-sm font-semibold text-amber-100 transition hover:border-amber-400/70 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isInstallingAppUpdate
                                        ? 'Installing App Update...'
                                        : appOutdated
                                          ? `Install App Update${desktopAppUpdateStatus?.targetVersion ? ` ${desktopAppUpdateStatus.targetVersion}` : ''}`
                                          : 'App Is Up To Date'}
                                </button>
                                <div className="mt-4 rounded-xl border border-amber-500/30 bg-slate-950/70 p-3 text-xs shadow-inner">
                                    <div className="mb-2 flex items-center justify-between text-[10px] font-semibold tracking-[0.25em] text-amber-200/70 uppercase">
                                        <span>App update log</span>
                                        {isInstallingAppUpdate && <span className="animate-pulse text-amber-300">Running</span>}
                                    </div>
                                    <div className="max-h-48 space-y-1 overflow-y-auto font-mono text-slate-300">
                                        {appUpdateLog.length === 0 && <div className="text-slate-500">Update diagnostics will appear here.</div>}
                                        {appUpdateLog.map((line, index) => (
                                            <div key={`${line}-${index}`} className="whitespace-pre-wrap break-words border-b border-slate-800/60 py-1 last:border-0">
                                                {line}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-600/70 bg-slate-950/45 p-6">
                                <h2 className="mb-1 text-lg font-semibold text-slate-100">LeRobot Runtime</h2>
                                <p className="mb-4 text-xs text-slate-300">
                                    Download lerobot-vulcan, create the Python environment, and repair or refresh local runtime tools.
                                </p>

                                <div className="grid gap-3">
                                    {orderedSteps.map((step, index) => {
                                        const status = stepState[step.id] ?? 'pending';
                                        return (
                                            <div
                                                key={step.id}
                                                className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/40 px-4 py-3"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 text-sm text-slate-400">
                                                        {index + 1}
                                                    </div>
                                                    <p className="text-sm font-semibold text-slate-100">{step.label}</p>
                                                </div>
                                                <div className={`text-xs font-semibold tracking-[0.2em] uppercase ${statusColors[status]}`}>{status}</div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-xs text-slate-200">
                                    <div className="font-semibold text-slate-100">LeRobot runtime release</div>
                                    <div className="mt-1 text-slate-300">Current: {runtimeCurrent}</div>
                                    <div className="text-slate-300">Available: {runtimeAvailable}</div>
                                    <div
                                        className={`mt-2 text-[11px] ${
                                            runtimeOutdated
                                                ? 'text-amber-200'
                                                : runtimeState === 'custom_build'
                                                  ? 'text-sky-200'
                                                  : runtimeState === 'unknown'
                                                    ? 'text-slate-300'
                                                    : 'text-emerald-200'
                                        }`}
                                    >
                                        {runtimeStatusMessage}
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-wrap items-center gap-4">
                                    <button
                                        type="button"
                                        onClick={() => runSetup('repair')}
                                        disabled={isRunning}
                                        title={
                                            isInstalled
                                                ? 'Repairs the setup without deleting existing modules.'
                                                : 'Install the robot runtime for the first time.'
                                        }
                                        className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isRunning ? 'Setting up...' : isInstalled ? 'Repair modules' : 'Install modules'}
                                    </button>

                                    {isInstalled && (
                                        <button
                                            type="button"
                                            onClick={() => runSetup('update')}
                                            disabled={isRunning}
                                            title="Redownloads all files from scratch, perfect after a larger update."
                                            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            Update modules
                                        </button>
                                    )}

                                    {isRunning && (
                                        <div className="flex items-center gap-2 text-sm text-slate-300">
                                            <Spinner color="yellow" width="w-4" height="h-4" />
                                            Running setup steps
                                        </div>
                                    )}
                                </div>
                                <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-950/70 p-3 text-xs shadow-inner">
                                    <div className="mb-2 flex items-center justify-between text-[10px] font-semibold tracking-[0.25em] text-slate-500 uppercase">
                                        <span>Runtime setup log</span>
                                        {isRunning && <span className="animate-pulse text-amber-300">Running</span>}
                                    </div>
                                    <div className="max-h-64 space-y-1 overflow-y-auto font-mono text-slate-300">
                                        {log.length === 0 && <div className="text-slate-500">Repair and update diagnostics will appear here.</div>}
                                        {log.map((line, index) => (
                                            <div key={`${line}-${index}`} className="whitespace-pre-wrap break-words border-b border-slate-800/60 py-1 last:border-0">
                                                {line}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                    <pre className="overflow-x-auto whitespace-pre-wrap break-words font-sans">{error}</pre>
                                </div>
                            )}

                            <div className="border-t border-slate-700/60 pt-4">
                                {isComplete && !isRunning && (
                                    <LinkButton
                                        href="/desktop/"
                                        className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-gradient-to-r from-red-500/70 via-orange-500/70 to-amber-400/70 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-red-500 hover:via-orange-500 hover:to-amber-400"
                                    >
                                        Go to home
                                    </LinkButton>
                                )}
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
