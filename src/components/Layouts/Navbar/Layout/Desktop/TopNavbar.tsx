'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLerobotUpdateStatus } from '@/hooks/System/lerobot-update.hook';
import { useDesktopAppUpdateStatus } from '@/hooks/System/desktop-app-update.hook';
import { LinkButton } from '@/components/Elements/Link/LinkButton';
import { useAuthSession } from '@/hooks/Auth/auth-session.hook';
import { usePathname } from 'next/navigation';
import { toast } from 'react-toastify';
import { toastInfoDefaults } from '@/utils/toast/toast-utils';
import { installAvailableDesktopUpdate } from '@/utils/updater/updater';

const DISMISSED_VERSION_KEY = 'desktop_app_update_dismissed_version';
const SEEN_VERSION_KEY = 'desktop_app_update_seen_version';

export const DesktopTopNavbar = () => {
    const { data: lerobotStatus } = useLerobotUpdateStatus();
    const { data: desktopAppUpdateStatus, refetch: refetchDesktopAppUpdateStatus } = useDesktopAppUpdateStatus();
    const { data: authSession } = useAuthSession();
    const pathname = usePathname();
    const [isUpdateDismissed, setIsUpdateDismissed] = useState(false);
    const [shouldHighlightUpdate, setShouldHighlightUpdate] = useState(false);
    const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);

    const needsRuntimeUpdate = lerobotStatus ? !lerobotStatus.upToDate : false;
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
        if (!targetVersion || isInstallingUpdate) {
            return;
        }
        setIsInstallingUpdate(true);
        try {
            await installAvailableDesktopUpdate({ expectedVersion: targetVersion });
        } finally {
            setIsInstallingUpdate(false);
            void refetchDesktopAppUpdateStatus();
        }
    };

    const isAuthenticated = Boolean(authSession?.isAuthenticated && authSession?.accountId);
    const isAccountPage = pathname?.startsWith('/desktop/account');
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
                    </Link>

                    <div className="grow" />

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
                                disabled={isInstallingUpdate}
                                className="cursor-pointer px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
                            >
                                {isInstallingUpdate ? 'Installing...' : `App Update${targetVersion ? ` ${targetVersion}` : ''}`}
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

                    {needsRuntimeUpdate && (
                        <LinkButton
                            href="/desktop/setup"
                            tooltip="Update available for lerobot-vulcan. Open setup to repair or update modules."
                            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-amber-400/70 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-300 hover:text-amber-100"
                        >
                            Update Available
                        </LinkButton>
                    )}

                    <div className="ml-3 flex items-center gap-2">
                        <LinkButton
                            href="/desktop/account"
                            className={`inline-flex cursor-pointer items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                                isAccountPage
                                    ? 'border-orange-300 bg-orange-400/20 text-orange-100'
                                    : 'border-slate-600 text-slate-100 hover:border-orange-300 hover:bg-orange-400/10 hover:text-orange-100'
                            }`}
                        >
                            {isAuthenticated ? 'Account' : 'Log In'}
                        </LinkButton>
                    </div>
                </div>
            </div>
        </nav>
    );
};
