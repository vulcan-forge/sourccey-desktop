'use client';

import { SideNavbar as KioskSideNavbar } from '@/components/Layouts/Navbar/Layout/Kiosk/SideNavbar';
import { KioskTopNavbar } from '@/components/Layouts/Navbar/Layout/Kiosk/TopNavbar';
import { RemoteControlBar } from '@/components/Layouts/ControlBar/RemoteControlBar';
import { PairingCodeModal } from '@/components/Elements/Modals/KioskRobotModals/PairingCodeModal';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-slate-850 kiosk-mode flex h-screen flex-col overflow-hidden">
            <KioskTopNavbar />
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <KioskSideNavbar />
                <div className="min-h-0 w-full flex-1 overflow-auto">{children}</div>
            </div>
            <RemoteControlBar />
            <PairingCodeModal />
        </div>
    );
}
