'use client';

import { AppBootScreen } from '@/components/Elements/AppBootScreen';
import { SideNavbar as KioskSideNavbar } from '@/components/Layouts/Navbar/Layout/Kiosk/SideNavbar';
import { KioskTopNavbar } from '@/components/Layouts/Navbar/Layout/Kiosk/TopNavbar';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { initFrontendLogger } from '@/utils/logs/frontend-logger';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { safeNavigate } from '@/utils/navigation';
import { getAppModeRedirectPath } from '@/utils/app-mode-route';
import { usePasswordChangedStatus } from '@/hooks/Components/SSH/ssh.hook';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { isKioskMode, isLoading: isLoadingAppMode } = useAppMode();
    const pathname = usePathname();
    const router = useRouter();
    const { data: hasConfiguredSsh, isLoading: isLoadingSshStatus } = usePasswordChangedStatus();

    useEffect(() => {
        initFrontendLogger();
    }, []);

    useEffect(() => {
        if (!isLoadingAppMode && !isKioskMode) {
            const redirectPath = getAppModeRedirectPath(pathname, false) ?? '/desktop/';
            safeNavigate(router, redirectPath);
        }
    }, [isLoadingAppMode, isKioskMode, pathname, router]);

    useEffect(() => {
        if (!isLoadingSshStatus && hasConfiguredSsh === false && !pathname?.startsWith('/kiosk/onboarding/ssh')) {
            safeNavigate(router, '/kiosk/onboarding/ssh');
        }
    }, [hasConfiguredSsh, isLoadingSshStatus, pathname, router]);

    if (isLoadingAppMode || isLoadingSshStatus) {
        return <AppBootScreen message="Preparing kiosk controls..." />;
    }

    if (!isKioskMode) {
        return <AppBootScreen message="Switching to desktop mode..." />;
    }

    if (hasConfiguredSsh === false && !pathname?.startsWith('/kiosk/onboarding/ssh')) {
        return <AppBootScreen message="Preparing SSH access..." />;
    }

    if (pathname?.startsWith('/kiosk/setup') || pathname?.startsWith('/kiosk/onboarding')) {
        return (
            <div className={`bg-slate-850 flex h-screen flex-col overflow-hidden ${isKioskMode ? 'kiosk-mode' : ''}`}>
                <KioskTopNavbar />
                <div className="min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</div>
            </div>
        );
    }

    return (
        <div className={`bg-slate-850 flex h-screen flex-col overflow-hidden ${isKioskMode ? 'kiosk-mode' : ''}`}>
            <KioskTopNavbar />
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <KioskSideNavbar />
                <div className="min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</div>
            </div>
        </div>
    );
}
