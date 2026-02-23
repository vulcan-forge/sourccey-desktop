'use client';

import React from 'react';
import Link from 'next/link';
import { FaTools } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { useDesktopExtrasStatus, useInstallDesktopExtras } from '@/hooks/System/setup-desktop-extras.hook';

type DesktopExtrasGateProps = {
    children: React.ReactNode;
    title?: string;
    description?: string;
    actionLabel?: string;
    className?: string;
};

const DEFAULT_TITLE = 'AI runtime modules required';
const DEFAULT_DESCRIPTION = 'Install the desktop AI runtime modules before running AI models.';
const DEFAULT_ACTION = 'Install AI Modules';

export const DesktopExtrasGate = ({
    children,
    title = DEFAULT_TITLE,
    description = DEFAULT_DESCRIPTION,
    actionLabel = DEFAULT_ACTION,
    className,
}: DesktopExtrasGateProps) => {
    const { data, isLoading, refetch } = useDesktopExtrasStatus();
    const { mutateAsync: installExtras, isPending } = useInstallDesktopExtras();

    const installed = data?.installed ?? false;
    const missing = data?.missing ?? [];
    const baseMissing = missing.some((item) => item.includes('modules/lerobot-vulcan') || item.includes('.venv'));

    const handleInstall = async () => {
        try {
            await installExtras();
            await refetch();
            toast.success('AI runtime modules installed.', { ...toastSuccessDefaults });
        } catch (error: any) {
            const message = error?.message || 'Failed to install AI runtime modules.';
            toast.error(message, { ...toastErrorDefaults });
        }
    };

    if (isLoading) {
        return (
            <div className={`rounded-xl border-2 border-slate-700/50 bg-slate-900/40 p-6 text-sm text-slate-300 ${className ?? ''}`}>
                Checking AI runtime modules...
            </div>
        );
    }

    if (installed) {
        return <>{children}</>;
    }

    return (
        <div
            className={`rounded-2xl border-2 border-amber-500/30 bg-slate-900/60 p-6 shadow-[0_12px_28px_rgba(15,23,42,0.35)] ${
                className ?? ''
            }`}
        >
            <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                        <FaTools className="text-amber-300" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">{title}</h2>
                        <p className="mt-1 text-sm text-slate-300">{description}</p>
                    </div>
                </div>

                {missing.length > 0 && (
                    <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-400">
                        {`Missing: ${missing.join(', ')}`}
                    </div>
                )}

                {baseMissing && <div className="text-xs text-amber-200/90">Base runtime is missing. Run the initial setup first.</div>}

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={handleInstall}
                        disabled={isPending || baseMissing}
                        className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                            isPending || baseMissing
                                ? 'cursor-not-allowed border-slate-700/60 bg-slate-800/60 text-slate-400'
                                : 'cursor-pointer border-amber-500/50 bg-amber-500/10 text-amber-100 hover:border-amber-400/70'
                        }`}
                    >
                        {isPending ? 'Installing...' : actionLabel}
                    </button>
                    <div className="grow"></div>
                    {baseMissing && (
                        <Link
                            href="/desktop/setup"
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-300"
                        >
                            Open Setup
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
};
