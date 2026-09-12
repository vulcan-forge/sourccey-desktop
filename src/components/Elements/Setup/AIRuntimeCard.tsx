'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { openPath } from '@tauri-apps/plugin-opener';
import { toast } from 'react-toastify';
import { FaCheckCircle, FaExclamationTriangle, FaFolderOpen, FaTools } from 'react-icons/fa';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import {
    formatSetupInvokeError,
    useDesktopExtrasStatus,
    useGetLerobotVulcanDir,
    useInstallDesktopExtras,
} from '@/hooks/System/setup-desktop-extras.hook';
import { Spinner } from '@/components/Elements/Spinner';
import { LinkButton } from '@/components/Elements/Link/LinkButton';

type StepStatus = 'pending' | 'started' | 'success' | 'error';

type AIRuntimeCardProps = {
    children?: ReactNode;
    title?: string;
    showInstallAction?: boolean;
    installOnlyWhenMissing?: boolean;
    showOpenModules?: boolean;
    showSettingsLink?: boolean;
    className?: string;
};

const installSteps = [
    { id: 'check', label: 'Verify runtime' },
    { id: 'download', label: 'Download runtime' },
    { id: 'verify', label: 'Verify archive' },
    { id: 'extract', label: 'Extract modules' },
    { id: 'uv', label: 'Prepare uv runtime' },
    { id: 'venv', label: 'Create environment' },
    { id: 'deps', label: 'Install Sourccey packages' },
    { id: 'post-install', label: 'Configure desktop runtime' },
    { id: 'xvla', label: 'Verify AI bindings' },
    { id: 'complete', label: 'Finalize setup' },
];

const statusColors: Record<StepStatus, string> = {
    pending: 'text-slate-500',
    started: 'text-amber-300',
    success: 'text-emerald-300',
    error: 'text-red-300',
};

export const AIRuntimeCard = ({
    children,
    title = 'AI Runtime',
    showInstallAction = true,
    installOnlyWhenMissing = false,
    showOpenModules = true,
    showSettingsLink = true,
    className,
}: AIRuntimeCardProps) => {
    const { data, isLoading, isError: isStatusError, error: statusError, refetch } = useDesktopExtrasStatus();
    const { mutateAsync: installExtras, isPending } = useInstallDesktopExtras();
    const { data: lerobotDir } = useGetLerobotVulcanDir();
    const [log, setLog] = useState<string[]>([]);
    const [stepState, setStepState] = useState<Record<string, StepStatus>>({});
    const [baseInstalled, setBaseInstalled] = useState(false);
    const [baseError, setBaseError] = useState('');
    const [isBaseLoading, setIsBaseLoading] = useState(true);
    const [showInstallDetails, setShowInstallDetails] = useState(false);

    const installed = data?.installed ?? false;
    const missing = data?.missing ?? [];
    const baseRuntimeMissing = missing.some((item) => item.includes('modules/lerobot-vulcan') || item.includes('.venv'));
    const isChecking = isBaseLoading || isLoading;
    const hasStatusError = Boolean(baseError || isStatusError);
    const runtimeInstalled = baseInstalled && installed;
    const isRuntimeActionDisabled = isPending || isBaseLoading;
    const shouldShowInstallAction =
        showInstallAction && !isChecking && !hasStatusError && (!installOnlyWhenMissing || !runtimeInstalled);

    const appendLog = useCallback((message: string) => {
        setLog((previous) => [...previous, `[${new Date().toLocaleTimeString()}] ${message}`]);
    }, []);

    const updateStep = useCallback(
        (step: string, status: StepStatus, message?: string | null) => {
            setStepState((previous) => ({ ...previous, [step]: status }));
            if (message) appendLog(message);
        },
        [appendLog]
    );

    useEffect(() => {
        let unlistenExtras: UnlistenFn | undefined;
        let unlistenBase: UnlistenFn | undefined;
        let cancelled = false;

        const handleProgress = (payload: { step: string; status: string; message?: string | null }) => {
            const { step, status, message } = payload;
            if (status === 'log') {
                if (message) appendLog(message);
                return;
            }
            const mapped: StepStatus =
                status === 'started' ? 'started' : status === 'success' ? 'success' : status === 'error' ? 'error' : 'pending';
            updateStep(step, mapped, message);
        };

        void Promise.all([
            listen<{ step: string; status: string; message?: string | null }>('setup:desktop-extras-progress', (event) =>
                handleProgress(event.payload)
            ),
            listen<{ step: string; status: string; message?: string | null }>('setup:progress', (event) => handleProgress(event.payload)),
        ]).then(([stopExtras, stopBase]) => {
            if (cancelled) {
                stopExtras();
                stopBase();
            } else {
                unlistenExtras = stopExtras;
                unlistenBase = stopBase;
            }
        });

        return () => {
            cancelled = true;
            unlistenExtras?.();
            unlistenBase?.();
        };
    }, [appendLog, updateStep]);

    useEffect(() => {
        const loadBaseStatus = async () => {
            if (!isTauri()) {
                setBaseInstalled(true);
                setIsBaseLoading(false);
                return;
            }

            try {
                const status = await invoke<{ installed: boolean; missing: string[] }>('setup_check');
                setBaseInstalled(status.installed);
                setBaseError('');
            } catch (error) {
                console.error('Failed to check base setup status:', error);
                setBaseInstalled(false);
                setBaseError('The base runtime status could not be checked.');
            } finally {
                setIsBaseLoading(false);
            }
        };

        void loadBaseStatus();
    }, []);

    const handleInstall = async () => {
        setShowInstallDetails(true);
        setLog([]);
        setBaseError('');
        setStepState(baseInstalled && !baseRuntimeMissing ? { check: 'success' } : {});
        appendLog('Starting AI runtime installation.');

        try {
            await installExtras();
            await refetch();
            appendLog('AI runtime installation and verification completed.');
            toast.success('AI runtime modules installed.', { ...toastSuccessDefaults });
        } catch (error) {
            const message = formatSetupInvokeError(error) || 'Failed to install AI runtime modules.';
            console.error('AI runtime installation failed:', error);
            setBaseError(message);
            appendLog(`Installation failed:\n${message}`);
            toast.error(message, { ...toastErrorDefaults });
        }
    };

    const handleCopyLog = async () => {
        const statusMessage = isStatusError ? `Runtime status error:\n${formatSetupInvokeError(statusError)}` : '';
        const contents = [...log, statusMessage].filter(Boolean).join('\n');
        try {
            await navigator.clipboard.writeText(contents);
            toast.success('AI runtime log copied.', { ...toastSuccessDefaults });
        } catch (error) {
            toast.error(`Failed to copy AI runtime log: ${formatSetupInvokeError(error)}`, { ...toastErrorDefaults });
        }
    };

    const handleClearLog = () => {
        setShowInstallDetails(false);
        setLog([]);
        setStepState({});
        setBaseError('');
    };

    const handleOpenModules = async () => {
        if (!lerobotDir) {
            toast.error('Modules folder is not available yet.', { ...toastErrorDefaults });
            return;
        }
        try {
            await openPath(lerobotDir);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to open modules folder.', { ...toastErrorDefaults });
        }
    };

    if (children && runtimeInstalled && !isChecking && !hasStatusError) return <>{children}</>;

    const statusMessage = isChecking
        ? 'Checking the AI runtime...'
        : hasStatusError
          ? 'The AI runtime status needs attention.'
          : runtimeInstalled
            ? 'The AI runtime is installed and ready to use.'
            : !baseInstalled
              ? 'The robot runtime and AI modules need to be installed. Both will be set up together.'
              : 'The AI runtime modules need to be installed.';

    return (
        <section className={`rounded-2xl border border-slate-700 bg-slate-950/45 p-5 shadow-xl sm:p-6 ${className ?? ''}`}>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Setup required</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
                </div>
                <StatusBadge checking={isChecking} error={hasStatusError} installed={runtimeInstalled} />
            </div>

            <p
                className={`mt-4 text-sm ${hasStatusError ? 'text-red-200' : runtimeInstalled ? 'text-emerald-200' : 'text-amber-200'}`}
            >
                {statusMessage}
            </p>

            {shouldShowInstallAction && (
                <button
                    type="button"
                    onClick={() => void handleInstall()}
                    disabled={isRuntimeActionDisabled}
                    className="mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400"
                >
                    {isPending ? <Spinner color="white" width="w-4" height="h-4" /> : <FaTools />}
                    {isPending ? 'Installing AI runtime...' : runtimeInstalled ? 'Reinstall AI runtime' : 'Install AI runtime'}
                </button>
            )}

            {(showOpenModules && runtimeInstalled) || (showSettingsLink && baseRuntimeMissing) ? (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {showSettingsLink && baseRuntimeMissing && (
                        <LinkButton
                            href="/desktop/settings"
                            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                        >
                            Open settings
                        </LinkButton>
                    )}
                    {showOpenModules && runtimeInstalled && (
                        <button
                            type="button"
                            onClick={() => void handleOpenModules()}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                        >
                            <FaFolderOpen /> Open modules
                        </button>
                    )}
                </div>
            ) : null}

            {showInstallAction && showInstallDetails && (
                <div className="mt-5 border-t border-slate-700 pt-5">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-slate-100">Installation steps</h3>
                        <div className="flex gap-2">
                            {log.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => void handleCopyLog()}
                                    className="cursor-pointer text-[11px] font-semibold text-slate-400 hover:text-slate-200"
                                >
                                    Copy log
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleClearLog}
                                disabled={isPending}
                                className="cursor-pointer text-[11px] font-semibold text-slate-400 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Hide
                            </button>
                        </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {installSteps.map((step, index) => {
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

                    {(missing.length > 0 || log.length > 0 || isStatusError) && (
                        <div className="mt-4 rounded-xl bg-black/20 p-3">
                            <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                                <span>Details</span>
                                {isPending && <span className="animate-pulse text-amber-300">Running</span>}
                            </div>
                            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono text-[11px] text-slate-300">
                                {missing.length > 0 && <div className="text-amber-200">Missing: {missing.join(', ')}</div>}
                                {log.map((line, index) => (
                                    <div key={`${line}-${index}`} className="break-words whitespace-pre-wrap">
                                        {line}
                                    </div>
                                ))}
                                {isStatusError && (
                                    <div className="break-words whitespace-pre-wrap text-red-200">
                                        {`Runtime status error:\n${formatSetupInvokeError(statusError)}`}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {baseError && <div className="mt-4 text-sm text-red-300">{baseError}</div>}
        </section>
    );
};

function StatusBadge({ checking, error, installed }: { checking: boolean; error: boolean; installed: boolean }) {
    const label = checking ? 'Checking' : error ? 'Needs attention' : installed ? 'Installed' : 'Setup required';
    const color = error
        ? 'border-red-400/30 bg-red-400/10 text-red-200'
        : installed
          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
          : 'border-amber-400/30 bg-amber-400/10 text-amber-200';

    return (
        <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${color}`}>
            {error ? <FaExclamationTriangle className="mr-1.5 inline" /> : installed ? <FaCheckCircle className="mr-1.5 inline" /> : null}
            {label}
        </span>
    );
}
