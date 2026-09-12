'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import Image from 'next/image';
import { Spinner } from '@/components/Elements/Spinner';
import { LinkButton } from '@/components/Elements/Link/LinkButton';
import { useKioskUpdateStatus } from '@/hooks/System/kiosk-update.hook';
import { FaCheckCircle, FaCloudDownloadAlt, FaExclamationTriangle, FaTools } from 'react-icons/fa';

type StepStatus = 'pending' | 'started' | 'success' | 'error';
type ActionKey = 'modules' | 'app';

type SetupProgress = {
    step: string;
    status: string;
    message?: string | null;
};

const statusColors: Record<StepStatus, string> = {
    pending: 'text-slate-500',
    started: 'text-amber-300',
    success: 'text-emerald-300',
    error: 'text-red-300',
};

const stepsByAction = {
    app: [
        { id: 'fetch', label: 'Fetch latest code' },
        { id: 'reset', label: 'Update application files' },
        { id: 'submodules', label: 'Update submodules' },
        { id: 'tag', label: 'Select runtime version' },
        { id: 'setup', label: 'Apply kiosk setup' },
        { id: 'complete', label: 'Finalize update' },
    ],
    modules: [
        { id: 'submodules', label: 'Initialize robot runtime' },
        { id: 'tag', label: 'Select latest version' },
        { id: 'deps', label: 'Refresh dependencies' },
        { id: 'complete', label: 'Finalize update' },
    ],
} as const;

type StepStateByAction = Record<ActionKey, Record<string, StepStatus>>;

const buildInitialStepState = (): StepStateByAction => ({
    app: Object.fromEntries(stepsByAction.app.map((step) => [step.id, 'pending'])) as Record<string, StepStatus>,
    modules: Object.fromEntries(stepsByAction.modules.map((step) => [step.id, 'pending'])) as Record<string, StepStatus>,
});

const normalizeVersionLabel = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return 'unknown';
    return trimmed.replace(/^vulcan\//, '').replace(/^kiosk\//, '');
};

export default function KioskSetupPage() {
    const { data: kioskUpdateStatus, isLoading: isLoadingKioskUpdate, refetch: refetchKioskUpdateStatus } = useKioskUpdateStatus();

    const [isRunning, setIsRunning] = useState(false);
    const [runningAction, setRunningAction] = useState<ActionKey | null>(null);
    const [expandedAction, setExpandedAction] = useState<ActionKey | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [log, setLog] = useState<string[]>([]);
    const runningActionRef = useRef<ActionKey | null>(null);
    const hasMarkedCompleteRef = useRef(false);
    const [stepStateByAction, setStepStateByAction] = useState<StepStateByAction>(buildInitialStepState);

    const appendLog = useCallback((message: string) => setLog((previous) => [...previous, message]), []);

    const updateStep = useCallback(
        (action: ActionKey, step: string, status: StepStatus, message?: string | null) => {
            setStepStateByAction((previous) => ({
                ...previous,
                [action]: { ...previous[action], [step]: status },
            }));
            if (message) appendLog(message);
        },
        [appendLog]
    );

    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        let cancelled = false;

        void listen<SetupProgress>('kiosk:setup-progress', (event) => {
            const action = runningActionRef.current;
            if (!action) return;

            const { step, status, message } = event.payload;
            if (status === 'log') {
                if (message) appendLog(message);
                return;
            }

            const mapped: StepStatus =
                status === 'started' ? 'started' : status === 'success' ? 'success' : status === 'error' ? 'error' : 'pending';
            updateStep(action, step, mapped, message);
            if (step === 'complete' && status === 'success') hasMarkedCompleteRef.current = true;
            if (status === 'error') {
                setError(message || 'Kiosk update failed.');
                setIsRunning(false);
                setRunningAction(null);
                runningActionRef.current = null;
            }
        }).then((stopListening) => {
            if (cancelled) stopListening();
            else unlisten = stopListening;
        });

        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [appendLog, updateStep]);

    const resetState = (action: ActionKey) => {
        runningActionRef.current = action;
        setRunningAction(action);
        setExpandedAction(action);
        setIsRunning(true);
        setError(null);
        setLog([]);
        hasMarkedCompleteRef.current = false;
        setStepStateByAction((previous) => ({
            ...previous,
            [action]: Object.fromEntries(stepsByAction[action].map((step) => [step.id, 'pending'])) as Record<string, StepStatus>,
        }));
    };

    const runSetup = async (action: ActionKey) => {
        resetState(action);
        try {
            await invoke(action === 'modules' ? 'kiosk_setup_repair' : 'kiosk_setup_update');
            if (!hasMarkedCompleteRef.current) {
                updateStep(
                    action,
                    'complete',
                    'success',
                    action === 'modules' ? 'Robot runtime update complete.' : 'Kiosk app update complete.'
                );
            }
        } catch (setupError) {
            const message =
                setupError instanceof Error
                    ? setupError.message
                    : action === 'modules'
                      ? 'Robot runtime update failed.'
                      : 'Kiosk app update failed.';
            setError(message);
            appendLog(message);
            updateStep(action, 'complete', 'error');
        } finally {
            setIsRunning(false);
            setRunningAction(null);
            runningActionRef.current = null;
            void refetchKioskUpdateStatus();
        }
    };

    const appCurrent = normalizeVersionLabel(kioskUpdateStatus?.appCurrent);
    const appLatest = normalizeVersionLabel(kioskUpdateStatus?.appRemote);
    const appOutdated = Boolean(kioskUpdateStatus?.appUpdateAvailable);
    const runtimeCurrent = normalizeVersionLabel(kioskUpdateStatus?.lerobotCurrent);
    const runtimeLatest = normalizeVersionLabel(kioskUpdateStatus?.lerobotRemote);
    const runtimeOutdated = Boolean(kioskUpdateStatus?.lerobotUpdateAvailable);
    const updateError = kioskUpdateStatus?.error?.trim() || null;

    const appStatusMessage = isLoadingKioskUpdate
        ? 'Checking for a kiosk app update...'
        : updateError
          ? 'The update check could not be completed.'
          : appOutdated
            ? `Version ${appLatest} is ready to install.`
            : 'Your kiosk app is up to date.';
    const runtimeStatusMessage = isLoadingKioskUpdate
        ? 'Checking for a robot runtime update...'
        : updateError
          ? 'The update check could not be completed.'
          : runtimeCurrent === 'unknown'
            ? `No robot runtime is installed. Install${runtimeLatest === 'unknown' ? ' the latest version' : ` version ${runtimeLatest}`}.`
            : runtimeOutdated
              ? `Version ${runtimeLatest} is ready to install.`
              : 'Your robot runtime is up to date.';

    return (
        <div className="min-h-full w-full overflow-y-auto bg-linear-to-br from-slate-800 via-slate-700 to-slate-800">
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
                                <h1 className="text-2xl font-semibold text-white sm:text-3xl">Kiosk Setup & Updates</h1>
                                <p className="mt-1 text-sm text-slate-300">The kiosk app and robot runtime update separately.</p>
                            </div>
                        </div>
                        <LinkButton
                            href="/kiosk/"
                            className="rounded-lg border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-300"
                        >
                            Back to home
                        </LinkButton>
                    </header>

                    <div className="mt-7 grid gap-4">
                        <UpdateSection
                            section="Section 1"
                            title="Vulcan Studio kiosk"
                            statusMessage={appStatusMessage}
                            current={appCurrent}
                            latest={appLatest}
                            loading={isLoadingKioskUpdate}
                            warning={Boolean(updateError)}
                            updateAvailable={appOutdated}
                            buttonLabel={
                                isRunning && runningAction === 'app'
                                    ? 'Updating kiosk...'
                                    : appOutdated
                                      ? `Update kiosk${appLatest === 'unknown' ? '' : ` to ${appLatest}`}`
                                      : 'Reinstall kiosk app'
                            }
                            buttonIcon={
                                isRunning && runningAction === 'app' ? (
                                    <Spinner color="black" width="w-4" height="h-4" />
                                ) : (
                                    <FaCloudDownloadAlt />
                                )
                            }
                            disabled={isRunning}
                            onClick={() => void runSetup('app')}
                            expanded={expandedAction === 'app'}
                            steps={stepsByAction.app}
                            stepState={stepStateByAction.app}
                            running={isRunning && runningAction === 'app'}
                            log={log}
                            accent="amber"
                        />

                        <UpdateSection
                            section="Section 2"
                            title="Robot runtime"
                            statusMessage={runtimeStatusMessage}
                            current={runtimeCurrent}
                            latest={runtimeLatest}
                            loading={isLoadingKioskUpdate}
                            warning={Boolean(updateError)}
                            updateAvailable={runtimeOutdated || runtimeCurrent === 'unknown'}
                            buttonLabel={
                                isRunning && runningAction === 'modules'
                                    ? 'Updating runtime...'
                                    : runtimeOutdated
                                      ? `Update runtime${runtimeLatest === 'unknown' ? '' : ` to ${runtimeLatest}`}`
                                      : runtimeCurrent === 'unknown'
                                        ? 'Install runtime'
                                        : 'Refresh runtime'
                            }
                            buttonIcon={
                                isRunning && runningAction === 'modules' ? <Spinner color="white" width="w-4" height="h-4" /> : <FaTools />
                            }
                            disabled={isRunning}
                            onClick={() => void runSetup('modules')}
                            expanded={expandedAction === 'modules'}
                            steps={stepsByAction.modules}
                            stepState={stepStateByAction.modules}
                            running={isRunning && runningAction === 'modules'}
                            log={log}
                            accent="orange"
                        />
                    </div>

                    {updateError && <p className="mt-4 text-xs text-red-200">{updateError}</p>}
                    {error && (
                        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
                    )}
                </div>
            </main>
        </div>
    );
}

type UpdateSectionProps = {
    section: string;
    title: string;
    statusMessage: string;
    current: string;
    latest: string;
    currentLabel?: string;
    loading: boolean;
    warning: boolean;
    updateAvailable: boolean;
    buttonLabel: string;
    buttonIcon: React.ReactNode;
    disabled: boolean;
    onClick: () => void;
    expanded: boolean;
    steps: ReadonlyArray<{ id: string; label: string }>;
    stepState: Record<string, StepStatus>;
    running: boolean;
    log: string[];
    accent: 'amber' | 'orange';
};

function UpdateSection({
    section,
    title,
    statusMessage,
    current,
    latest,
    currentLabel = 'Installed',
    loading,
    warning,
    updateAvailable,
    buttonLabel,
    buttonIcon,
    disabled,
    onClick,
    expanded,
    steps,
    stepState,
    running,
    log,
    accent,
}: UpdateSectionProps) {
    const buttonColors = accent === 'amber' ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'bg-orange-500 text-white hover:bg-orange-400';
    const messageColor = warning ? 'text-red-200' : updateAvailable ? 'text-amber-200' : 'text-emerald-200';

    return (
        <section className="rounded-2xl border border-slate-700 bg-slate-950/45 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">{section}</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
                </div>
                <StatusBadge loading={loading} warning={warning} updateAvailable={updateAvailable} />
            </div>

            <p className={`mt-4 text-sm ${messageColor}`}>{statusMessage}</p>
            <VersionSummary current={current} latest={latest} currentLabel={currentLabel} />

            <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                className={`mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400 ${buttonColors}`}
            >
                {buttonIcon}
                {buttonLabel}
            </button>

            {expanded && <StepDetails steps={steps} stepState={stepState} running={running} log={log} />}
        </section>
    );
}

function StatusBadge({ loading, warning, updateAvailable }: { loading: boolean; warning: boolean; updateAvailable: boolean }) {
    const label = loading ? 'Checking' : warning ? 'Check unavailable' : updateAvailable ? 'Update available' : 'Up to date';
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

function VersionSummary({ current, latest, currentLabel }: { current: string; latest: string; currentLabel: string }) {
    return (
        <div className="mt-4 grid grid-cols-2 divide-x divide-slate-700 rounded-xl border border-slate-700 bg-slate-900/70">
            <div className="px-4 py-3">
                <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{currentLabel}</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-100">{current}</p>
            </div>
            <div className="px-4 py-3">
                <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Latest</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-100">{latest}</p>
            </div>
        </div>
    );
}

function StepDetails({
    steps,
    stepState,
    running,
    log,
}: {
    steps: ReadonlyArray<{ id: string; label: string }>;
    stepState: Record<string, StepStatus>;
    running: boolean;
    log: string[];
}) {
    return (
        <div className="mt-5 border-t border-slate-700 pt-5">
            <h3 className="text-sm font-semibold text-slate-100">Update steps</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {steps.map((step, index) => {
                    const status = stepState[step.id] ?? 'pending';
                    return (
                        <div key={step.id} className="flex items-center justify-between rounded-lg bg-slate-900/80 px-3 py-2.5">
                            <span className="text-xs text-slate-200">
                                {index + 1}. {step.label}
                            </span>
                            <span className={`text-[10px] font-semibold uppercase ${statusColors[status]}`}>{status}</span>
                        </div>
                    );
                })}
            </div>
            <div className="mt-4 rounded-xl bg-black/20 p-3">
                <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    <span>Details</span>
                    {running && <span className="animate-pulse text-amber-300">Running</span>}
                </div>
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono text-[11px] text-slate-300">
                    {log.length === 0 && <div className="text-slate-500">Preparing...</div>}
                    {log.map((line, index) => (
                        <div key={`${line}-${index}`} className="break-words whitespace-pre-wrap">
                            {line}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
