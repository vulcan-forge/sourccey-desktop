'use client';

import { AppBootScreen } from '@/components/Elements/AppBootScreen';
import { SideNavbar as KioskSideNavbar } from '@/components/Layouts/Navbar/Layout/Kiosk/SideNavbar';
import { KioskTopNavbar } from '@/components/Layouts/Navbar/Layout/Kiosk/TopNavbar';
import { RemoteControlBar } from '@/components/Layouts/ControlBar/RemoteControlBar';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { initFrontendLogger } from '@/utils/logs/frontend-logger';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { safeNavigate } from '@/utils/navigation';
import { getAppModeRedirectPath } from '@/utils/app-mode-route';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { isKioskMode, isLoading: isLoadingAppMode } = useAppMode();
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        initFrontendLogger();
    }, []);

    useEffect(() => {
        if (!isLoadingAppMode && !isKioskMode) {
            const redirectPath = getAppModeRedirectPath(pathname, false) ?? '/desktop/';
            safeNavigate(router, redirectPath);
        }
    }, [isLoadingAppMode, isKioskMode, pathname, router]);

    if (isLoadingAppMode) {
        return <AppBootScreen message="Preparing kiosk controls..." />;
    }

    if (!isKioskMode) {
        return <AppBootScreen message="Switching to desktop mode..." />;
    }

    if (pathname?.startsWith('/kiosk/setup')) {
        return (
            <div className={`bg-slate-850 flex h-screen flex-col overflow-hidden ${isKioskMode ? 'kiosk-mode' : ''}`}>
                <KioskTopNavbar />
                <div className="min-h-0 w-full flex-1 overflow-auto">{children}</div>
            </div>
        );
    }

    return (
        <div className={`bg-slate-850 flex h-screen flex-col overflow-hidden ${isKioskMode ? 'kiosk-mode' : ''}`}>
            <KioskTopNavbar />
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <KioskSideNavbar />
                <div className="min-h-0 w-full flex-1 overflow-auto">{children}</div>
            </div>
            <RemoteControlBar />
        </div>
    );
}
