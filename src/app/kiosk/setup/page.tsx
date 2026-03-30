'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Spinner } from '@/components/Elements/Spinner';
import { LinkButton } from '@/components/Elements/Link/LinkButton';
import { useKioskUpdateStatus } from '@/hooks/System/kiosk-update.hook';
import { useDesktopAppUpdateStatus } from '@/hooks/System/desktop-app-update.hook';

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
        { id: 'submodules', label: 'Update LeRobot submodule' },
        { id: 'complete', label: 'Finalize' },
    ],
    app: [
        { id: 'fetch', label: 'Fetch latest code' },
        { id: 'reset', label: 'Reset repository' },
        { id: 'submodules', label: 'Update submodules' },
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
    }, [updateStep]);

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
                updateStep(action, 'complete', 'success', action === 'modules' ? 'LeRobot update complete.' : 'App update complete.');
            }
            setIsRunning(false);
            setRunningAction(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : action === 'modules' ? 'LeRobot update failed.' : 'App update failed.';
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

    const lerobotCurrent = kioskUpdateStatus?.lerobotCurrent ?? 'unknown';
    const lerobotAvailable = kioskUpdateStatus?.lerobotRemote ?? 'unknown';
    const lerobotOutdated = Boolean(kioskUpdateStatus?.lerobotUpdateAvailable);
    const lerobotStatusMessage = isLoadingKioskUpdate
        ? 'Checking LeRobot version status...'
        : lerobotOutdated
          ? 'Out of date because your pinned LeRobot tag is behind the latest available tag.'
          : 'Up to date. Your pinned LeRobot tag matches the latest available tag.';

    const appCurrent = desktopAppUpdateStatus?.currentVersion ?? 'unknown';
    const appAvailable = desktopAppUpdateStatus?.targetVersion ?? appCurrent;
    const appParityBlocked = Boolean(desktopAppUpdateStatus?.updateAvailable && !desktopAppUpdateStatus?.parityPassed);
    const appOutdated = Boolean(
        desktopAppUpdateStatus?.updateAvailable && desktopAppUpdateStatus?.parityPassed && desktopAppUpdateStatus?.targetVersion
    );
    const appStatusMessage = isLoadingDesktopAppUpdate
        ? 'Checking app version status...'
        : appParityBlocked
          ? 'Update detected, but install is blocked because parity checks did not pass yet.'
          : appOutdated
            ? 'Out of date because a newer signed app version is available.'
            : 'Up to date. You are on the latest app version.';

    const renderStepList = (action: ActionKey) => {
        return (
            <div className="grid gap-3">
                {stepsByAction[action].map((step, index) => {
                    const status = stepStateByAction[action][step.id] ?? 'pending';
                    return (
                        <div key={`${action}-${step.id}`} className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/40 px-4 py-3">
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
        );
    };

    return (
        <div className="flex min-h-full w-full flex-col bg-linear-to-br from-slate-950 via-slate-900 to-slate-800">
            <div className="container mx-auto flex min-h-full flex-col items-center justify-start px-6 py-12">
                <div className="relative w-full max-w-5xl">
                    <div className="absolute -top-20 -left-16 h-32 w-32 rounded-full bg-red-500/20 blur-3xl" />
                    <div className="absolute -right-16 -bottom-16 h-32 w-32 rounded-full bg-amber-400/20 blur-3xl" />

                    <div className="relative rounded-3xl border border-slate-700/60 bg-slate-900/80 p-8 shadow-2xl backdrop-blur">
                        <div className="flex flex-col gap-6">
                            <div>
                                <h1 className="text-3xl font-semibold text-white">Kiosk Updates</h1>
                                <p className="mt-2 text-sm text-slate-300">
                                    Use Update LeRobot for a fast submodule refresh. Use Update App to pull latest code and rerun kiosk setup.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                <div
                                    className={`rounded-2xl border bg-slate-950/50 p-6 ${
                                        runningAction === 'modules' ? 'border-slate-400/80' : 'border-slate-700/60'
                                    }`}
                                >
                                    <h2 className="mb-1 text-lg font-semibold text-slate-100">Update LeRobot</h2>
                                    <p className="mb-4 text-xs text-slate-400">Refreshes the `modules/lerobot-vulcan` submodule to the version pinned by this app repo.</p>
                                    {renderStepList('modules')}
                                    <button
                                        type="button"
                                        onClick={() => runSetup('modules')}
                                        disabled={isRunning}
                                        className="mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isRunning && runningAction === 'modules' ? 'Updating LeRobot...' : 'Update LeRobot'}
                                    </button>
                                    <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-xs text-slate-200">
                                        <div className="font-semibold text-slate-100">LeRobot version status</div>
                                        <div className="mt-1 text-slate-300">Current: {lerobotCurrent}</div>
                                        <div className="text-slate-300">Available: {lerobotAvailable}</div>
                                        <div className={`mt-2 text-[11px] ${lerobotOutdated ? 'text-amber-200' : 'text-emerald-200'}`}>
                                            {lerobotStatusMessage}
                                        </div>
                                    </div>
                                </div>

                                <div
                                    className={`rounded-2xl border bg-slate-950/50 p-6 ${
                                        runningAction === 'app' ? 'border-amber-400/80' : 'border-amber-500/30'
                                    }`}
                                >
                                    <h2 className="mb-1 text-lg font-semibold text-amber-100">Update App</h2>
                                    <p className="mb-4 text-xs text-amber-200/80">Fetches latest kiosk code, updates submodules, and reruns the kiosk setup installer.</p>
                                    {renderStepList('app')}
                                    <button
                                        type="button"
                                        onClick={() => runSetup('app')}
                                        disabled={isRunning}
                                        className="mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-amber-500/60 bg-amber-500/10 px-6 py-3 text-sm font-semibold text-amber-100 transition hover:border-amber-400/70 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isRunning && runningAction === 'app' ? 'Updating App...' : 'Update App'}
                                    </button>
                                    <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                                        <div className="font-semibold text-amber-100">App version status</div>
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
                            </div>

                            {error && (
                                <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                    {error}
                                </div>
                            )}

                            <div className="flex flex-col gap-4">
                                {isRunning && (
                                    <div className="flex items-center gap-2 text-sm text-slate-300">
                                        <Spinner color="yellow" width="w-4" height="h-4" />
                                        Running {runningAction === 'modules' ? 'LeRobot' : 'App'} update steps
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

                            {log.length > 0 && (
                                <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 text-xs text-slate-300 shadow-inner">
                                    <div className="mb-2 text-[10px] font-semibold tracking-[0.3em] text-slate-500 uppercase">Setup log</div>
                                    <div className="max-h-40 space-y-2 overflow-y-auto">
                                        {log.map((line, index) => (
                                            <div
                                                key={`${line}-${index}`}
                                                className="rounded-md border border-slate-800/80 bg-slate-950/70 px-3 py-2 text-slate-200"
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
