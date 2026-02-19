'use client';

import { SideNavbar as DesktopSideNavbar } from '@/components/Layouts/Navbar/Layout/Desktop/SideNavbar';
import { DesktopTopNavbar } from '@/components/Layouts/Navbar/Layout/Desktop/TopNavbar';
import { RemoteControlBar } from '@/components/Layouts/ControlBar/RemoteControlBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-slate-850 flex h-screen flex-col overflow-hidden">
            <DesktopTopNavbar />
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <DesktopSideNavbar />
                <div className="min-h-0 w-full flex-1 overflow-auto">{children}</div>
            </div>
            <RemoteControlBar />
        </div>
    );
}
