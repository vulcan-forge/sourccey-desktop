'use client';

import { Spinner } from '@/components/Elements/Spinner';
import { SideNavbar as DesktopSideNavbar } from '@/components/Layouts/Navbar/Layout/Desktop/SideNavbar';
import { DesktopTopNavbar } from '@/components/Layouts/Navbar/Layout/Desktop/TopNavbar';
import { RemoteControlBar } from '@/components/Layouts/ControlBar/RemoteControlBar';
import { initFrontendLogger } from '@/utils/logs/frontend-logger';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { safeNavigate } from '@/utils/navigation';
import { getAppModeRedirectPath } from '@/utils/app-mode-route';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { isKioskMode, isLoading: isLoadingAppMode } = useAppMode();

    useEffect(() => {
        initFrontendLogger();
    }, []);

    useEffect(() => {
        if (!isLoadingAppMode && isKioskMode) {
            const redirectPath = getAppModeRedirectPath(pathname, true) ?? '/kiosk/';
            safeNavigate(router, redirectPath);
        }
    }, [isLoadingAppMode, isKioskMode, pathname, router]);

    if (isLoadingAppMode) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Spinner />
            </div>
        );
    }

    if (!isLoadingAppMode && isKioskMode) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Spinner />
            </div>
        );
    }

    if (pathname?.startsWith('/desktop/setup')) {
        return (
            <>
                <div className={`bg-slate-850 flex h-screen flex-col overflow-hidden`}>{children}</div>
            </>
        );
    }

    return (
        <div className={`bg-slate-850 flex h-screen flex-col overflow-hidden`}>
            <DesktopTopNavbar />
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <DesktopSideNavbar />
                <div className="min-h-0 w-full flex-1 overflow-auto">{children}</div>
            </div>
            <RemoteControlBar />
        </div>
    );
}
