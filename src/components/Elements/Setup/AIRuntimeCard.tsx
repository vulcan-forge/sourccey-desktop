'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { openPath } from '@tauri-apps/plugin-opener';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { useDesktopExtrasStatus, useGetLerobotVulcanDir, useInstallDesktopExtras } from '@/hooks/System/setup-desktop-extras.hook';
import { Spinner } from '@/components/Elements/Spinner';
import { LinkButton } from '@/components/Elements/Link/LinkButton';

type StepStatus = 'pending' | 'started' | 'success' | 'error';

type AIRuntimeCardProps = {
    title?: string;
    description?: string;
    showOpenModules?: boolean;
    showSettingsLink?: boolean;
    className?: string;
};

const DEFAULT_TITLE = 'AI Runtime';
const DEFAULT_DESCRIPTION = 'Install or repair the AI runtime modules needed to download and run models locally.';

export const AIRuntimeCard = ({
    title = DEFAULT_TITLE,
    description = DEFAULT_DESCRIPTION,
    showOpenModules = true,
    showSettingsLink = true,
    className,
}: AIRuntimeCardProps) => {
    const { data, isLoading, refetch } = useDesktopExtrasStatus();
    const { mutateAsync: installExtras, isPending } = useInstallDesktopExtras();
    const { data: lerobotDir } = useGetLerobotVulcanDir();
    const [log, setLog] = useState<string[]>([]);
    const [stepState, setStepState] = useState<Record<string, StepStatus>>({});
    const [baseInstalled, setBaseInstalled] = useState(false);
    const [baseMissing, setBaseMissing] = useState<string[]>([]);
    const [baseError, setBaseError] = useState('');
    const [isBaseLoading, setIsBaseLoading] = useState(true);

    const installed = data?.installed ?? false;
    const missing = data?.missing ?? [];
    const baseRuntimeMissing = missing.some((item) => item.includes('modules/lerobot-vulcan') || item.includes('.venv'));
    const isRuntimeActionDisabled = isPending || baseRuntimeMissing || isBaseLoading;

    const orderedSteps = useMemo(
        () => [
            { id: 'check', label: 'Verify base runtime' },
            { id: 'uv', label: 'Prepare uv runtime' },
            { id: 'deps', label: 'Install desktop extras' },
            { id: 'xvla', label: 'Verify XVLA bindings' },
            { id: 'complete', label: 'Finalize' },
        ],
        []
    );

    const appendLog = useCallback((message: string) => {
        setLog((prev) => [...prev, message]);
    }, []);

    const updateStep = useCallback(
        (step: string, status: StepStatus, message?: string | null) => {
            setStepState((prev) => ({ ...prev, [step]: status }));
            if (message) {
                appendLog(message);
            }
        },
        [appendLog]
    );

    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        let cancelled = false;
        const startListener = async () => {
            unlisten = await listen<{ step: string; status: string; message?: string | null }>('setup:desktop-extras-progress', (event) => {
                const { step, status, message } = event.payload;
                const mapped = status === 'started' ? 'started' : status === 'success' ? 'success' : status === 'error' ? 'error' : 'pending';
                updateStep(step, mapped, message ?? undefined);
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
        const loadBaseStatus = async () => {
            if (!isTauri()) {
                setBaseInstalled(true);
                setBaseMissing([]);
                setIsBaseLoading(false);
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
            } finally {
                setIsBaseLoading(false);
            }
        };
        void loadBaseStatus();
    }, []);

    const handleInstall = async () => {
        setLog([]);
        setStepState({ check: baseInstalled && !baseRuntimeMissing ? 'success' : 'pending' });
        try {
            await installExtras();
            await refetch();
            toast.success('AI runtime modules installed.', { ...toastSuccessDefaults });
        } catch (error: any) {
            const message = error?.message || 'Failed to install AI runtime modules.';
            toast.error(message, { ...toastErrorDefaults });
        }
    };

    const handleOpenModules = async () => {
        if (!lerobotDir) {
            toast.error('Modules folder is not available yet.', { ...toastErrorDefaults });
            return;
        }
        try {
            await openPath(lerobotDir);
        } catch (error: any) {
            const message = error?.message || 'Failed to open modules folder.';
            toast.error(message, { ...toastErrorDefaults });
        }
    };

    return (
        <div className={`rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-xl ${className ?? ''}`}>
            <div className="flex flex-col gap-4">
                <div>
                    <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">{title}</div>
                    <p className="mt-2 text-sm text-slate-300">{description}</p>
                </div>
                {isBaseLoading && (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/50 px-4 py-3 text-sm text-slate-300">
                        <Spinner color="yellow" width="w-4" height="h-4" />
                        Checking base runtime...
                    </div>
                )}
                {!isBaseLoading && !baseInstalled && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        Clean re-run the base setup to access the AI runtime.
                    </div>
                )}
                {(isBaseLoading || baseInstalled) && (
                    <>
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={handleInstall}
                                disabled={isRuntimeActionDisabled}
                                className={`inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                                    isRuntimeActionDisabled
                                        ? 'cursor-not-allowed border-slate-700/60 bg-slate-800/60 text-slate-400'
                                        : 'cursor-pointer border-amber-500/50 bg-amber-500/10 text-amber-100 hover:border-amber-400/70'
                                }`}
                            >
                                {isPending ? 'Installing...' : installed ? 'Reinstall AI Modules' : 'Install AI Modules'}
                            </button>
                            <div className="text-xs text-slate-400">
                                {isBaseLoading
                                    ? 'Checking base runtime...'
                                    : isLoading
                                      ? 'Checking status...'
                                      : installed
                                        ? 'Status: Installed'
                                        : 'Status: Not installed'}
                            </div>
                            <div className="grow"></div>
                            {showOpenModules && installed && !isBaseLoading && (
                                <button
                                    type="button"
                                    onClick={handleOpenModules}
                                    className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
                                >
                                    Open Modules Folder
                                </button>
                            )}
                        </div>
                        {missing.length > 0 && (
                            <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-400">
                                {`Missing: ${missing.join(', ')}`}
                            </div>
                        )}
                        {baseRuntimeMissing && (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-200/90">
                                <span>Default runtime is missing. Install the base venv from Settings.</span>
                                {showSettingsLink && (
                                    <LinkButton
                                        href="/desktop/settings"
                                        className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-amber-500/40 px-3 py-1 text-[11px] font-semibold text-amber-100 transition hover:border-amber-300/70"
                                    >
                                        Open Settings
                                    </LinkButton>
                                )}
                            </div>
                        )}
                        {isPending && (
                            <>
                                <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-400">
                                    Installing desktop extras. This can take a few minutes.
                                </div>
                                <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 text-xs text-slate-300 shadow-inner">
                                    <div className="mb-2 text-[10px] font-semibold tracking-[0.3em] text-slate-500 uppercase">
                                        Install steps
                                    </div>
                                    <div className="grid gap-2">
                                        {orderedSteps.map((step) => {
                                            const status = stepState[step.id] ?? 'pending';
                                            const statusClass =
                                                status === 'success'
                                                    ? 'text-emerald-300'
                                                    : status === 'error'
                                                      ? 'text-red-300'
                                                      : status === 'started'
                                                        ? 'text-amber-300'
                                                        : 'text-slate-400';
                                            return (
                                                <div
                                                    key={step.id}
                                                    className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2"
                                                >
                                                    <div className="text-[11px] font-semibold text-slate-100">{step.label}</div>
                                                    <div className={`text-[10px] font-semibold tracking-[0.2em] uppercase ${statusClass}`}>
                                                        {status}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {log.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            <div className="text-[10px] font-semibold tracking-[0.3em] text-slate-500 uppercase">
                                                Install log
                                            </div>
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
                            </>
                        )}
                        {baseError && <div className="text-sm text-red-300">{baseError}</div>}
                    </>
                )}
            </div>
        </div>
    );
};
