'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Spinner } from '@/components/Elements/Spinner';
import { LinkButton } from '@/components/Elements/Link/LinkButton';
import { useLerobotUpdateStatus } from '@/hooks/System/lerobot-update.hook';
import { useDesktopAppUpdateStatus } from '@/hooks/System/desktop-app-update.hook';

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
    const [error, setError] = useState<string | null>(null);
    const [log, setLog] = useState<string[]>([]);
    const hasMarkedInstalledRef = useRef(false);
    const [stepState, setStepState] = useState<Record<string, StepStatus>>(() => {
        const initial: Record<string, StepStatus> = {};
        steps.forEach((step) => {
            initial[step.id] = 'pending';
        });
        return initial;
    });

    const orderedSteps = useMemo(() => steps, []);

    const appendLog = useCallback((message: string) => {
        setLog((prev) => [...prev, message]);
    }, []);

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
                const mapped: StepStatus =
                    status === 'started' ? 'started' : status === 'success' ? 'success' : status === 'error' ? 'error' : 'pending';
                updateStep(step, mapped, message ?? undefined);
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
    }, [updateStep]);

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

        try {
            if (action === 'update') {
                await invoke('setup_reset');
            } else {
                await invoke('setup_run', { force: isInstalled });
            }
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

    const formatVersionLabel = (tag?: string | null, commit?: string | null) => {
        if (tag && tag.trim().length > 0) {
            const normalizedTag = tag.trim().replace(/^vulcan\//, '').replace(/^kiosk\//, '');
            return normalizedTag;
        }
        if (commit && commit.trim().length > 0) {
            return commit.slice(0, 10);
        }
        return 'unknown';
    };

    const runtimeCurrent = formatVersionLabel(lerobotStatus?.currentTag, lerobotStatus?.currentCommit);
    const runtimeAvailable = formatVersionLabel(lerobotStatus?.latestTag, lerobotStatus?.latestCommit);
    const runtimeOutdated = lerobotStatus ? !lerobotStatus.upToDate : false;
    const runtimeStatusMessage = isLoadingLerobotStatus
        ? 'Checking runtime version status...'
        : runtimeOutdated
          ? 'Out of date because your local LeRobot runtime is behind the latest available commit/tag.'
          : 'Up to date. Your local LeRobot runtime matches the latest available commit/tag.';

    const appCurrent = formatVersionLabel(desktopAppUpdateStatus?.currentVersion, null);
    const appAvailable = formatVersionLabel(desktopAppUpdateStatus?.targetVersion, null);
    const appParityBlocked = Boolean(desktopAppUpdateStatus?.updateAvailable && !desktopAppUpdateStatus?.parityPassed);
    const appOutdated = Boolean(
        desktopAppUpdateStatus?.updateAvailable && desktopAppUpdateStatus?.parityPassed && desktopAppUpdateStatus?.targetVersion
    );
    const appStatusMessage = isLoadingDesktopAppStatus
        ? 'Checking app version status...'
        : appParityBlocked
          ? 'Update detected, but install is blocked because parity checks did not pass yet.'
          : appOutdated
            ? 'Out of date because a newer signed app version is available.'
            : 'Up to date. You are on the latest app version.';

    if (!isReady) {
        return <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900" />;
    }

    return (
        <div className="flex h-screen w-full overflow-y-auto bg-linear-to-br from-slate-950 via-slate-900 to-slate-800">
            <div className="container mx-auto flex min-h-full flex-col items-center justify-start px-6 py-12">
                <div className="relative w-full max-w-3xl">
                    <div className="absolute -top-20 -left-16 h-32 w-32 rounded-full bg-red-500/20 blur-3xl" />
                    <div className="absolute -right-16 -bottom-16 h-32 w-32 rounded-full bg-amber-400/20 blur-3xl" />

                    <div className="relative rounded-3xl border border-slate-700/60 bg-slate-900/80 p-8 shadow-2xl backdrop-blur">
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center gap-4">
                                <Image
                                    src="/assets/logo/SourcceyLogo.png"
                                    alt="Sourccey Logo"
                                    width={56}
                                    height={56}
                                    className="drop-shadow-logo"
                                />
                                <div>
                                    <h1 className="text-3xl font-semibold text-white">Prepare the local robot runtime</h1>
                                </div>
                            </div>

                            <p className="text-sm text-slate-300">
                                We will download lerobot-vulcan, create the Python environment, and configure the runtime tools. This can take
                                several minutes depending on your connection and machine.
                            </p>

                            <div className="rounded-2xl border border-slate-700/60 bg-slate-950/50 p-6">
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
                                                    <div>
                                                        <p className="text-sm font-semibold text-slate-100">{step.label}</p>
                                                    </div>
                                                </div>
                                                <div className={`text-xs font-semibold tracking-[0.2em] uppercase ${statusColors[status]}`}>
                                                    {status}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {error && (
                                <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                    <pre className="overflow-x-auto whitespace-pre-wrap break-words font-sans">{error}</pre>
                                </div>
                            )}

                            <div className="flex flex-wrap items-center justify-start gap-4">
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

                                <div className="grow"></div>
                                {isRunning && (
                                    <div className="flex items-center gap-2 text-sm text-slate-300">
                                        <Spinner color="yellow" width="w-4" height="h-4" />
                                        Running setup steps
                                    </div>
                                )}
                                {isInstalled && (
                                    <button
                                        type="button"
                                        onClick={() => runSetup('update')}
                                        disabled={isRunning}
                                        title={
                                            isInstalled
                                                ? 'Redownloads all files from scratch, perfect after a larger update.'
                                                : 'Install modules before running a reset.'
                                        }
                                        className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Update modules
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-xs text-slate-200">
                                    <div className="font-semibold text-slate-100">Lerobot Vulcan version</div>
                                    <div className="mt-1 text-slate-300">Current: {runtimeCurrent}</div>
                                    <div className="text-slate-300">Available: {runtimeAvailable}</div>
                                    <div className={`mt-2 text-[11px] ${runtimeOutdated ? 'text-amber-200' : 'text-emerald-200'}`}>
                                        {runtimeStatusMessage}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                                    <div className="font-semibold text-amber-100">Desktop app status</div>
                                    <div className="mt-1 text-amber-100/90">Current: {appCurrent}</div>
                                    <div className="text-amber-100/90">Available: {appAvailable}</div>
                                    <div
                                        className={`mt-2 text-[11px] ${
                                            appOutdated ? 'text-amber-100' : appParityBlocked ? 'text-red-200' : 'text-emerald-200'
                                        }`}
                                    >
                                        {appStatusMessage}
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-slate-700/60 pt-4">
                                {isComplete && !isRunning && (
                                    <LinkButton
                                        href="/desktop/"
                                        className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-gradient-to-r from-red-500/70 via-orange-500/70 to-amber-400/70 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-red-500 hover:via-orange-500 hover:to-amber-400"
                                    >
                                        Go to desktop
                                    </LinkButton>
                                )}
                            </div>

                            {log.length > 0 && (
                                <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 text-xs text-slate-300 shadow-inner">
                                    <div className="mb-2 text-[10px] font-semibold tracking-[0.3em] text-slate-500 uppercase">Setup log</div>
                                    <div className="max-h-40 space-y-2 overflow-y-auto">
                                        {log.map((line, index) => (
                                            <div
                                                key={`${line}-${index}`}
                                                className="rounded-md border border-slate-800/80 bg-slate-950/70 px-3 py-2 text-slate-200"
                                            >
                                                <pre className="whitespace-pre-wrap break-words font-sans">{line}</pre>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
