'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Spinner } from '@/components/Elements/Spinner';
import { LinkButton } from '@/components/Elements/Link/LinkButton';
import { useKioskUpdateStatus } from '@/hooks/System/kiosk-update.hook';
import { useDesktopAppUpdateStatus } from '@/hooks/System/desktop-app-update.hook';
import { FaArrowRight, FaCheckCircle, FaCloudDownloadAlt, FaExclamationTriangle, FaSyncAlt } from 'react-icons/fa';

type StepStatus = 'pending' | 'started' | 'success' | 'error';
type ActionKey = 'modules' | 'app';

type SetupProgress = {
    step: string;
    status: string;
    message?: string | null;
};

const statusColors: Record<StepStatus, string> = {
    pending: 'text-slate-400',
    started: 'text-amber-300',
    success: 'text-emerald-300',
    error: 'text-red-300',
};

const stepsByAction = {
    modules: [
        { id: 'submodules', label: 'Initialize lerobot-vulcan runtime' },
        { id: 'tag', label: 'Select newest vulcan tag' },
        { id: 'deps', label: 'Refresh robot dependencies' },
        { id: 'complete', label: 'Finalize' },
    ],
    app: [
        { id: 'fetch', label: 'Fetch latest code' },
        { id: 'reset', label: 'Reset repository' },
        { id: 'submodules', label: 'Update submodules' },
        { id: 'tag', label: 'Select newest vulcan tag' },
        { id: 'setup', label: 'Run kiosk setup script' },
        { id: 'complete', label: 'Finalize' },
    ],
} as const;

type StepStateByAction = Record<ActionKey, Record<string, StepStatus>>;

const buildInitialStepState = (): StepStateByAction => ({
    modules: Object.fromEntries(stepsByAction.modules.map((step) => [step.id, 'pending'])) as Record<string, StepStatus>,
    app: Object.fromEntries(stepsByAction.app.map((step) => [step.id, 'pending'])) as Record<string, StepStatus>,
});

export default function KioskSetupPage() {
    const { data: kioskUpdateStatus, isLoading: isLoadingKioskUpdate, refetch: refetchKioskUpdateStatus } = useKioskUpdateStatus();
    const {
        data: desktopAppUpdateStatus,
        isLoading: isLoadingDesktopAppUpdate,
        refetch: refetchDesktopAppUpdateStatus,
    } = useDesktopAppUpdateStatus();

    const [isRunning, setIsRunning] = useState(false);
    const [runningAction, setRunningAction] = useState<ActionKey | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [log, setLog] = useState<string[]>([]);
    const hasMarkedCompleteRef = useRef(false);
    const runningActionRef = useRef<ActionKey | null>(null);

    const [stepStateByAction, setStepStateByAction] = useState<StepStateByAction>(() => buildInitialStepState());

    const appendLog = useCallback((message: string) => {
        setLog((prev) => [...prev, message]);
    }, []);

    const updateStep = useCallback(
        (action: ActionKey, step: string, status: StepStatus, message?: string | null) => {
            setStepStateByAction((prev) => ({
                ...prev,
                [action]: {
                    ...prev[action],
                    [step]: status,
                },
            }));
            if (message) {
                appendLog(message);
            }
        },
        [appendLog]
    );

    useEffect(() => {
        runningActionRef.current = runningAction;
    }, [runningAction]);

    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        let cancelled = false;
        const startListener = async () => {
            unlisten = await listen<SetupProgress>('kiosk:setup-progress', (event) => {
                const action = runningActionRef.current;
                if (!action) {
                    return;
                }

                const { step, status, message } = event.payload;
                if (status === 'log') {
                    if (message) {
                        appendLog(message);
                    }
                    return;
                }
                const mapped: StepStatus =
                    status === 'started' ? 'started' : status === 'success' ? 'success' : status === 'error' ? 'error' : 'pending';
                updateStep(action, step, mapped, message ?? undefined);
                if (status === 'error' && message) {
                    setError(message);
                    setIsRunning(false);
                    setRunningAction(null);
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

    const resetState = (action: ActionKey) => {
        setRunningAction(action);
        setIsRunning(true);
        setError(null);
        setLog([]);
        hasMarkedCompleteRef.current = false;
        setStepStateByAction((prev) => {
            const resetForAction = Object.fromEntries(stepsByAction[action].map((step) => [step.id, 'pending'])) as Record<string, StepStatus>;
            return {
                ...prev,
                [action]: resetForAction,
            };
        });
    };

    const runSetup = async (action: ActionKey) => {
        resetState(action);
        try {
            if (action === 'modules') {
                await invoke('kiosk_setup_repair');
            } else {
                await invoke('kiosk_setup_update');
            }
            if (!hasMarkedCompleteRef.current) {
                hasMarkedCompleteRef.current = true;
                updateStep(action, 'complete', 'success', action === 'modules' ? 'lerobot-vulcan runtime update complete.' : 'App update complete.');
            }
            setIsRunning(false);
            setRunningAction(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : action === 'modules' ? 'lerobot-vulcan runtime update failed.' : 'App update failed.';
            setError(message);
            setIsRunning(false);
            setRunningAction(null);
            appendLog(message);
            updateStep(action, 'complete', 'error', message);
        } finally {
            void refetchKioskUpdateStatus();
            void refetchDesktopAppUpdateStatus();
        }
    };

    const normalizeVersionLabel = (value?: string | null) => {
        if (!value) {
            return null;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        if (trimmed.startsWith('vulcan/')) {
            return trimmed.replace(/^vulcan\//, '');
        }
        if (trimmed.startsWith('kiosk/')) {
            return trimmed.replace(/^kiosk\//, '');
        }
        return trimmed;
    };

    const lerobotCurrent = normalizeVersionLabel(kioskUpdateStatus?.lerobotCurrent) ?? 'unknown';
    const lerobotAvailable = normalizeVersionLabel(kioskUpdateStatus?.lerobotRemote) ?? 'unknown';
    const lerobotOutdated = Boolean(kioskUpdateStatus?.lerobotUpdateAvailable);
    const lerobotStatusMessage = isLoadingKioskUpdate
        ? 'Checking lerobot-vulcan runtime version status...'
        : lerobotOutdated
          ? lerobotCurrent !== 'unknown' && lerobotAvailable !== 'unknown'
              ? `Out of date: ${lerobotCurrent} is behind ${lerobotAvailable}.`
              : 'Out of date because your local lerobot-vulcan runtime is behind the latest available version.'
          : 'Up to date. Your local lerobot-vulcan runtime matches the latest available version.';

    const appCurrent = normalizeVersionLabel(desktopAppUpdateStatus?.currentVersion) ?? 'unknown';
    const appAvailable = normalizeVersionLabel(desktopAppUpdateStatus?.targetVersion) ?? 'unknown';
    const appMetadataKnown = appCurrent !== 'unknown' && appAvailable !== 'unknown';
    const appError = desktopAppUpdateStatus?.error?.trim() || null;
    const appOutdated = Boolean(desktopAppUpdateStatus?.updateAvailable && desktopAppUpdateStatus?.targetVersion);
    const appStatusMessage = isLoadingDesktopAppUpdate
        ? 'Checking app version status...'
        : appError
          ? 'Update check returned warnings. See details below.'
          : !appMetadataKnown
            ? 'Unable to resolve app version metadata from latest.json yet.'
            : appOutdated
              ? 'Out of date because a newer signed app version is available.'
              : 'Up to date. You are on the latest app version.';

    const renderStepList = (action: ActionKey) => {
        return (
            <div className={action === 'app' ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-3'}>
                {stepsByAction[action].map((step, index) => {
                    const status = stepStateByAction[action][step.id] ?? 'pending';
                    return (
                        <div key={`${action}-${step.id}`} className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2.5">
                            <div className="flex items-center gap-3">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-700 text-xs text-slate-400">
                                    {index + 1}
                                </div>
                                <p className="text-sm font-semibold text-slate-100">{step.label}</p>
                            </div>
                            <div className={`text-xs font-semibold tracking-[0.2em] uppercase ${statusColors[status]}`}>{status}</div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="flex min-h-full w-full flex-col bg-linear-to-br from-slate-800 via-slate-700 to-slate-800">
            <div className="container mx-auto flex min-h-full flex-col items-center justify-start px-6 py-12">
                <div className="relative w-full max-w-4xl">
                    <div className="absolute -top-20 -left-16 h-36 w-36 rounded-full bg-red-400/30 blur-3xl" />
                    <div className="absolute -right-16 -bottom-16 h-36 w-36 rounded-full bg-amber-300/30 blur-3xl" />

                    <div className="relative rounded-3xl border border-slate-600/70 bg-slate-900/75 p-8 shadow-2xl backdrop-blur">
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <h1 className="text-3xl font-semibold text-white">Kiosk Setup & Updates</h1>
                                    <p className="mt-2 text-sm text-slate-200">App Update on top and lerobot-vulcan runtime Update below for a cleaner flow.</p>
                                </div>
                                <LinkButton
                                    href="/kiosk/"
                                    className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-500/80 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-300"
                                >
                                    Back to home
                                </LinkButton>
                            </div>

                            <section
                                className={`relative overflow-hidden rounded-3xl border bg-linear-to-br from-slate-950 via-slate-950 to-amber-950/50 p-6 shadow-xl transition sm:p-7 ${
                                    runningAction === 'app' ? 'border-amber-300/80 shadow-amber-950/40' : 'border-amber-500/35'
                                }`}
                            >
                                <div className="pointer-events-none absolute -top-20 -right-16 h-48 w-48 rounded-full bg-amber-400/15 blur-3xl" />
                                <div className="relative">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-200 shadow-inner">
                                                <FaSyncAlt className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="text-[10px] font-semibold tracking-[0.24em] text-amber-300/70 uppercase">Vulcan Studio</div>
                                                <h2 className="mt-0.5 text-xl font-semibold text-white">App Update</h2>
                                            </div>
                                        </div>
                                        <div
                                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                                                appError
                                                    ? 'border-red-400/30 bg-red-400/10 text-red-200'
                                                    : appOutdated
                                                      ? 'border-amber-400/30 bg-amber-400/10 text-amber-100'
                                                      : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                                            }`}
                                        >
                                            {appError ? <FaExclamationTriangle /> : <FaCheckCircle />}
                                            {appError ? 'Needs attention' : appOutdated ? 'Update available' : 'Up to date'}
                                        </div>
                                    </div>

                                    <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
                                        Install the latest kiosk app, refresh its submodules, and reapply the kiosk configuration.
                                    </p>

                                    <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-white/8 bg-black/20 p-4">
                                        <div>
                                            <div className="text-[10px] font-semibold tracking-[0.2em] text-slate-500 uppercase">Installed</div>
                                            <div className="mt-1 font-mono text-lg font-semibold text-slate-100">{appCurrent}</div>
                                        </div>
                                        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10 text-amber-200">
                                            <FaArrowRight className="h-3.5 w-3.5" />
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-semibold tracking-[0.2em] text-amber-300/70 uppercase">Available</div>
                                            <div className="mt-1 font-mono text-lg font-semibold text-amber-100">{appAvailable}</div>
                                        </div>
                                    </div>

                                    <div className={`mt-3 text-xs leading-5 ${appError ? 'text-red-200' : appOutdated ? 'text-amber-100' : 'text-emerald-200'}`}>
                                        {appStatusMessage}
                                    </div>
                                    {appError && <div className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-red-400/20 bg-red-400/8 p-3 text-[11px] text-red-200">{appError}</div>}

                                    <button
                                        type="button"
                                        onClick={() => runSetup('app')}
                                        disabled={isRunning}
                                        className="mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-linear-to-r from-amber-500 to-orange-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-amber-950/30 transition hover:-translate-y-0.5 hover:from-amber-400 hover:to-orange-400 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                                    >
                                        {isRunning && runningAction === 'app' ? <Spinner color="black" width="w-4" height="h-4" /> : <FaCloudDownloadAlt />}
                                        {isRunning && runningAction === 'app' ? 'Updating app...' : appOutdated ? `Update to ${appAvailable}` : 'Reinstall latest app version'}
                                    </button>

                                    <div className="mt-6 border-t border-slate-800/80 pt-5">
                                        <div className="mb-3 text-[10px] font-semibold tracking-[0.24em] text-slate-500 uppercase">Update process</div>
                                        {renderStepList('app')}
                                    </div>
                                </div>
                            </section>

                            <div
                                className={`rounded-2xl border bg-slate-950/50 p-6 ${
                                    runningAction === 'modules' ? 'border-slate-400/80' : 'border-slate-600/70'
                                }`}
                            >
                                <h2 className="mb-1 text-lg font-semibold text-slate-100">lerobot-vulcan runtime Update</h2>
                                <p className="mb-4 text-xs text-slate-300">Update `modules/lerobot-vulcan` to the newest released `vulcan/*` tag.</p>
                                {renderStepList('modules')}
                                <button
                                    type="button"
                                    onClick={() => runSetup('modules')}
                                    disabled={isRunning}
                                    className="mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isRunning && runningAction === 'modules' ? 'Updating lerobot-vulcan runtime...' : 'Update lerobot-vulcan runtime'}
                                </button>
                                <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-xs text-slate-200">
                                    <div className="font-semibold text-slate-100">lerobot-vulcan runtime version</div>
                                    <div className="mt-1 text-slate-300">Current: {lerobotCurrent}</div>
                                    <div className="text-slate-300">Available: {lerobotAvailable}</div>
                                    <div className={`mt-2 text-[11px] ${lerobotOutdated ? 'text-amber-200' : 'text-emerald-200'}`}>
                                        {lerobotStatusMessage}
                                    </div>
                                </div>
                            </div>

                            {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

                            <div className="flex flex-col gap-4">
                                {isRunning && (
                                    <div className="flex items-center gap-2 text-sm text-slate-200">
                                        <Spinner color="yellow" width="w-4" height="h-4" />
                                        Running {runningAction === 'modules' ? 'lerobot-vulcan runtime' : 'App'} update steps
                                    </div>
                                )}
                                {!isRunning && (
                                    <LinkButton
                                        href="/kiosk/settings"
                                        className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-300"
                                    >
                                        Back to settings
                                    </LinkButton>
                                )}
                            </div>

                            {(isRunning || log.length > 0) && (
                                <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 text-xs text-slate-300 shadow-inner">
                                    <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-semibold tracking-[0.3em] text-slate-500 uppercase">
                                        <span>Live setup log</span>
                                        {isRunning && <span className="animate-pulse text-amber-300">Running</span>}
                                    </div>
                                    <div className="max-h-64 space-y-1 overflow-y-auto font-mono">
                                        {log.length === 0 && <div className="text-slate-500">Waiting for command output...</div>}
                                        {log.map((line, index) => (
                                            <div
                                                key={`${line}-${index}`}
                                                className="whitespace-pre-wrap break-words border-b border-slate-800/60 px-2 py-1 text-slate-200 last:border-0"
                                            >
                                                {line}
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
