'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Spinner } from '@/components/Elements/Spinner';

const steps = [
    { id: 'download', label: 'Download lerobot-vulcan' },
    { id: 'extract', label: 'Extract modules' },
    { id: 'uv', label: 'Install uv runtime' },
    { id: 'venv', label: 'Create environment' },
    { id: 'deps', label: 'Install dependencies' },
    { id: 'protobuf', label: 'Compile protobuf (if present)' },
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
    const [isReady, setIsReady] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [log, setLog] = useState<string[]>([]);
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

    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
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
        };

        void startListener();

        return () => {
            if (unlisten) {
                unlisten();
            }
        };
    }, [updateStep]);

    useEffect(() => {
        const check = async () => {
            if (!isTauri()) {
                setIsReady(true);
                return;
            }

            try {
                const status = (await invoke('setup_check')) as SetupStatus;
                setIsInstalled(status.installed);
                if (status.installed) {
                    router.push('/desktop/');
                    return;
                }
            } catch (err) {
                console.error('Setup status check failed:', err);
            }
            setIsReady(true);
        };

        void check();
    }, [router]);

    const startSetup = async () => {
        setIsRunning(true);
        setError(null);
        setLog([]);
        setIsComplete(false);
        setStepState((prev) => {
            const reset = { ...prev };
            Object.keys(reset).forEach((key) => {
                reset[key] = 'pending';
            });
            return reset;
        });

        try {
            await invoke('setup_run');
            setIsRunning(false);
            setIsComplete(true);
            setIsInstalled(true);
            appendLog('Setup complete. Ready to continue.');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Setup failed.';
            setError(message);
            setIsRunning(false);
            appendLog(message);
        }
    };

    if (!isReady) {
        return <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900" />;
    }

    return (
        <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-800">
            <div className="container mx-auto flex min-h-screen flex-col items-center justify-center px-6 py-12">
                <div className="relative w-full max-w-3xl">
                    <div className="absolute -top-20 -left-16 h-32 w-32 rounded-full bg-red-500/20 blur-3xl" />
                    <div className="absolute -right-16 -bottom-16 h-32 w-32 rounded-full bg-amber-400/20 blur-3xl" />

                    <div className="relative overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-900/80 p-8 shadow-2xl backdrop-blur">
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
                                    <p className="text-xs font-semibold tracking-[0.3em] text-slate-400 uppercase">First Run Setup</p>
                                    <h1 className="text-3xl font-semibold text-white">Prepare the local robot runtime</h1>
                                </div>
                            </div>

                            <p className="text-sm text-slate-300">
                                We will download lerobot-vulcan, create the Python environment, and configure the runtime tools. This can take several minutes depending on your connection and machine.
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
                                <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <button
                                    type="button"
                                    onClick={startSetup}
                                    disabled={isRunning}
                                    className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-gradient-to-r from-red-500/70 via-orange-500/70 to-amber-400/70 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-red-500 hover:via-orange-500 hover:to-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isRunning ? 'Setting up...' : isInstalled ? 'Update setup' : 'Start setup'}
                                </button>

                                {isRunning && (
                                    <div className="flex items-center gap-2 text-sm text-slate-300">
                                        <Spinner color="yellow" width="w-4" height="h-4" />
                                        Running setup steps
                                    </div>
                                )}

                                {isComplete && !isRunning && (
                                    <button
                                        type="button"
                                        onClick={() => router.push('/desktop/')}
                                        className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
                                    >
                                        Go to desktop
                                    </button>
                                )}
                            </div>

                            {log.length > 0 && (
                                <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 text-xs text-slate-300 shadow-inner">
                                    <div className="mb-2 text-[10px] font-semibold tracking-[0.3em] text-slate-500 uppercase">Setup log</div>
                                    <div className="max-h-40 space-y-2 overflow-y-auto">
                                        {log.map((line, index) => (
                                            <div key={`${line}-${index}`} className="rounded-md border border-slate-800/80 bg-slate-950/70 px-3 py-2 text-slate-200">
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
