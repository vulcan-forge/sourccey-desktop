'use client';

import { Spinner } from '@/components/Elements/Spinner';
import { SideNavbar } from '@/components/Layouts/Navbar/Layout/SideNavbar';
import { TopNavbar } from '@/components/Layouts/Navbar/Layout/TopNavbar';
import { RemoteControlBar } from '@/components/Layouts/ControlBar/RemoteControlBar';
import { PairingCodeModal } from '@/components/Elements/Modals/KioskRobotModals/PairingCodeModal';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { initFrontendLogger } from '@/utils/logs/frontend-logger';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { isKioskMode, isLoading: isLoadingAppMode } = useAppMode();
    const pathname = usePathname();

    useEffect(() => {
        initFrontendLogger();
    }, []);

    if (isLoadingAppMode) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Spinner />
            </div>
        );
    }

    if (pathname?.startsWith('/kiosk/setup')) {
        return (
            <div className={`bg-slate-850 flex h-screen flex-col overflow-hidden ${isKioskMode ? 'kiosk-mode' : ''}`}>
                <TopNavbar />
                <div className="min-h-0 w-full flex-1 overflow-auto">{children}</div>
                <PairingCodeModal />
            </div>
        );
    }

    return (
        <div className={`bg-slate-850 flex h-screen flex-col overflow-hidden ${isKioskMode ? 'kiosk-mode' : ''}`}>
            <TopNavbar />
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <SideNavbar />
                <div className="min-h-0 w-full flex-1 overflow-auto">{children}</div>
            </div>
            <RemoteControlBar />
            <PairingCodeModal />
        </div>
    );
}
