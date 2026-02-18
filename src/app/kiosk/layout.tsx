'use client';

import { Spinner } from '@/components/Elements/Spinner';
import { SideNavbar } from '@/components/Layouts/Navbar/Layout/SideNavbar';
import { TopNavbar } from '@/components/Layouts/Navbar/Layout/TopNavbar';
import { ControlBar } from '@/components/Layouts/ControlBar/ControlBar';
import { RemoteControlBar } from '@/components/Layouts/ControlBar/RemoteControlBar';
import { PairingCodeModal } from '@/components/Elements/Modals/KioskRobotModals/PairingCodeModal';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { isKioskMode, isLoading: isLoadingAppMode } = useAppMode();

    if (isLoadingAppMode) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Spinner />
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
            <ControlBar />
            <RemoteControlBar />
            <PairingCodeModal />
        </div>
    );
}
