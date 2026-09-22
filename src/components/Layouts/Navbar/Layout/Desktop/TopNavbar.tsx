'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLerobotUpdateStatus } from '@/hooks/System/lerobot-update.hook';
import { useDesktopAppInstallProgress, useDesktopAppUpdateStatus } from '@/hooks/System/desktop-app-update.hook';
import { useDesktopEnvironmentSettings } from '@/hooks/System/desktop-environment.hook';
import { useDesktopSetupProgress } from '@/hooks/System/desktop-setup-progress.hook';
import { LinkButton } from '@/components/Elements/Link/LinkButton';
import { useAuthSession } from '@/hooks/Auth/auth-session.hook';
import { usePathname } from 'next/navigation';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastInfoDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { installAvailableDesktopUpdate } from '@/utils/updater/updater';
import { isLerobotRuntimeUpdateAvailable } from '@/utils/updater/lerobot-runtime';
import { AI_MODEL_KEY, useAiModelDownloadStatus, useCancelAiModelDownload } from '@/hooks/Models/AIModel/ai-model.hook';
import { queryClient } from '@/hooks/default';
import { FaDownload, FaStop } from 'react-icons/fa';

const DISMISSED_VERSION_KEY = 'desktop_app_update_dismissed_version';
const SEEN_VERSION_KEY = 'desktop_app_update_seen_version';

export const DesktopTopNavbar = () => {
    const { data: lerobotStatus } = useLerobotUpdateStatus();
    const { data: desktopAppUpdateStatus, refetch: refetchDesktopAppUpdateStatus } = useDesktopAppUpdateStatus();
    const { data: desktopEnvironmentSettings } = useDesktopEnvironmentSettings();
    const appInstallProgress = useDesktopAppInstallProgress();
    const { data: runtimeProgress } = useDesktopSetupProgress();
    const { data: authSession } = useAuthSession();
    const { data: modelDownload } = useAiModelDownloadStatus();
    const { mutateAsync: cancelModelDownload, isPending: isCancellingModelDownload } = useCancelAiModelDownload();
    const pathname = usePathname();
    const [isUpdateDismissed, setIsUpdateDismissed] = useState(false);
    const [shouldHighlightUpdate, setShouldHighlightUpdate] = useState(false);
    const observedModelDownloadUpdateRef = useRef<number | null>(null);

    useEffect(() => {
        if (!modelDownload) return;
        if (observedModelDownloadUpdateRef.current === null) {
            observedModelDownloadUpdateRef.current = modelDownload.updatedAtEpochMs;
            return;
        }
        if (observedModelDownloadUpdateRef.current === modelDownload.updatedAtEpochMs) return;
        observedModelDownloadUpdateRef.current = modelDownload.updatedAtEpochMs;

        if (modelDownload.status === 'completed') {
            void queryClient.invalidateQueries({ queryKey: AI_MODEL_KEY });
            toast.success(`Finished downloading ${modelDownload.repoId ?? 'model'}.`, { ...toastSuccessDefaults });
        } else if (modelDownload.status === 'error' && modelDownload.error) {
            toast.error(modelDownload.error, { ...toastErrorDefaults });
        } else if (modelDownload.status === 'cancelled') {
            toast.info('Model download cancelled. Partial files were kept for a future resume.', { ...toastInfoDefaults });
        }
    }, [modelDownload]);

    const cancelActiveModelDownload = async () => {
        try {
            await cancelModelDownload();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || 'Could not cancel model download.');
            toast.error(message, { ...toastErrorDefaults });
        }
    };

    const needsRuntimeUpdate = isLerobotRuntimeUpdateAvailable(lerobotStatus);
    const targetVersion = desktopAppUpdateStatus?.targetVersion ?? null;
    const isForceUpdate = desktopAppUpdateStatus?.force === true;
    const hasAppUpdate = Boolean(desktopAppUpdateStatus?.updateAvailable) && Boolean(targetVersion);

    useEffect(() => {
        if (!hasAppUpdate || !targetVersion) {
            setIsUpdateDismissed(false);
            setShouldHighlightUpdate(false);
            return;
        }

        if (typeof window === 'undefined') {
            setIsUpdateDismissed(false);
            setShouldHighlightUpdate(true);
            return;
        }

        const dismissedVersion = window.localStorage.getItem(DISMISSED_VERSION_KEY);
        const seenVersion = window.localStorage.getItem(SEEN_VERSION_KEY);
        const dismissed = !isForceUpdate && dismissedVersion === targetVersion;
        const firstSeenForVersion = seenVersion !== targetVersion;

        setIsUpdateDismissed(dismissed);
        setShouldHighlightUpdate(firstSeenForVersion);

        if (firstSeenForVersion) {
            window.localStorage.setItem(SEEN_VERSION_KEY, targetVersion);
        }
    }, [hasAppUpdate, isForceUpdate, targetVersion]);

    const appUpdateVisible = hasAppUpdate && (!isUpdateDismissed || isForceUpdate);

    const appUpdateButtonClass = useMemo(() => {
        if (shouldHighlightUpdate) {
            return 'border-amber-300/90 bg-amber-400/20 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.35)] animate-pulse';
        }
        return 'border-amber-400/70 bg-amber-500/10 text-amber-200';
    }, [shouldHighlightUpdate]);

    const hideUpdateChip = () => {
        if (!targetVersion || isForceUpdate) {
            return;
        }
        setIsUpdateDismissed(true);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(DISMISSED_VERSION_KEY, targetVersion);
        }

        toast.info(
            <div className="flex items-center gap-3">
                <span>Desktop update hidden for {targetVersion}.</span>
                <button
                    type="button"
                    className="rounded border border-sky-300/80 px-2 py-0.5 text-xs font-semibold text-sky-200 transition hover:border-sky-200 hover:text-sky-100"
                    onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.localStorage.removeItem(DISMISSED_VERSION_KEY);
                        }
                        setIsUpdateDismissed(false);
                    }}
                >
                    Undo
                </button>
            </div>,
            {
                ...toastInfoDefaults,
                autoClose: 5500,
                closeOnClick: false,
            }
        );
    };

    const installUpdate = async () => {
        if (!targetVersion || appInstallProgress.running || runtimeProgress?.running) {
            return;
        }
        try {
            await installAvailableDesktopUpdate({ expectedVersion: targetVersion });
        } finally {
            void refetchDesktopAppUpdateStatus();
        }
    };

    const isAuthenticated = Boolean(authSession?.isAuthenticated && authSession?.accountId);
    const isAccountPage = pathname?.startsWith('/desktop/account');
    const environmentBadgeLabel = desktopEnvironmentSettings?.badgeLabel ?? null;
    const showRuntimeUpdateButton = needsRuntimeUpdate || Boolean(runtimeProgress?.running);
    return (
        <nav className="relative z-80 flex h-16 flex-col border-b border-slate-700 bg-slate-800 backdrop-blur-md">
            <div className="flex h-full items-center justify-between px-8">
                <div className="flex h-full w-full items-center">
                    <Link href="/desktop/" className="flex w-128 items-center gap-2 text-2xl font-bold">
                        <Image
                            src="/assets/logo/SourcceyLogo.png"
                            alt="Sourccey Logo"
                            width={48}
                            height={48}
                            priority
                            className="drop-shadow-logo"
                        />
                        <span className="inline-block bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text pb-1 text-3xl leading-tight text-transparent">
                            Vulcan Studio
                        </span>
                        <span className="-rotate-6 rounded-full border border-amber-200/80 bg-gradient-to-br from-amber-200 to-orange-400 px-2 py-0.5 text-[10px] font-extrabold tracking-[0.12em] text-slate-900 uppercase shadow-sm shadow-orange-500/30">
                            Beta
                        </span>
                    </Link>

                    <div className="grow" />

                    <div className="ml-3 flex items-center gap-2">
                        {modelDownload?.running && (
                            <div className="relative inline-flex max-w-56 items-stretch overflow-hidden rounded-lg border border-emerald-400/60 bg-emerald-500/10 text-emerald-100">
                                <Link
                                    href="/desktop/models"
                                    className="flex min-w-0 items-center gap-2 px-3 py-2 text-xs font-semibold"
                                    title={`Downloading ${modelDownload.repoId ?? 'model'}`}
                                >
                                    <FaDownload className="shrink-0" />
                                    <span className="truncate">
                                        {modelDownload.status === 'cancelling' ? 'Cancelling model…' : `Model ${modelDownload.progress ?? 0}%`}
                                    </span>
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => void cancelActiveModelDownload()}
                                    disabled={modelDownload.cancelRequested || isCancellingModelDownload}
                                    className="cursor-pointer border-l border-emerald-300/30 px-2 text-red-200 transition hover:bg-red-500/15 hover:text-red-100 disabled:cursor-wait disabled:opacity-50"
                                    aria-label="Cancel model download"
                                    title="Cancel model download"
                                >
                                    <FaStop className="h-3 w-3" />
                                </button>
                                <span
                                    className="absolute bottom-0 left-0 h-0.5 bg-emerald-300 transition-all"
                                    style={{ width: `${modelDownload.progress ?? 0}%` }}
                                />
                            </div>
                        )}

                        {environmentBadgeLabel && (
                            <LinkButton
                                href="/desktop/settings/developer"
                                tooltip="Open desktop developer settings"
                                className="inline-flex cursor-pointer items-center rounded-full border border-amber-400/60 bg-amber-500/10 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-amber-200 transition hover:border-amber-300 hover:bg-amber-500/15 hover:text-amber-100"
                            >
                                {environmentBadgeLabel}
                            </LinkButton>
                        )}

                        {appUpdateVisible && (
                            <div
                                className={`inline-flex items-center rounded-lg border ${appUpdateButtonClass} transition`}
                                title={
                                    targetVersion
                                        ? `Desktop app update ${targetVersion} available${desktopAppUpdateStatus?.releaseNotes ? '. Click to review and install.' : '.'}`
                                        : 'Desktop app update available'
                                }
                            >
                                <button
                                    type="button"
                                    onClick={() => void installUpdate()}
                                    disabled={appInstallProgress.running || runtimeProgress?.running}
                                    className="cursor-pointer px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
                                >
                                    {appInstallProgress.running
                                        ? `Installing… ${appInstallProgress.percent}%`
                                        : `App Update${targetVersion ? ` ${targetVersion}` : ''}`}
                                </button>
                                {!isForceUpdate && (
                                    <button
                                        type="button"
                                        onClick={hideUpdateChip}
                                        className="cursor-pointer border-l border-amber-300/40 px-2 py-2 text-xs font-bold text-amber-200 transition hover:text-amber-50"
                                        aria-label="Hide this app update version"
                                        title="Hide this version"
                                    >
                                        X
                                    </button>
                                )}
                            </div>
                        )}

                        {showRuntimeUpdateButton && (
                            <LinkButton
                                href="/desktop/setup"
                                tooltip="A newer lerobot-vulcan runtime release tag is available. Open Desktop Updates to repair or refresh modules."
                                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-amber-400/70 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-300 hover:text-amber-100"
                            >
                                {runtimeProgress?.running ? `Runtime ~${runtimeProgress.percent}%` : 'Update Available'}
                            </LinkButton>
                        )}

                        {/* <LinkButton
                            href="/desktop/account"
                            className={`inline-flex cursor-pointer items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                                isAccountPage
                                    ? 'border-orange-300 bg-orange-400/20 text-orange-100'
                                    : 'border-slate-600 text-slate-100 hover:border-orange-300 hover:bg-orange-400/10 hover:text-orange-100'
                            }`}
                        >
                            {isAuthenticated ? 'Account' : 'Log In'}
                        </LinkButton> */}
                    </div>
                </div>
            </div>
        </nav>
    );
};
