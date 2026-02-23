'use client';

import { Spinner } from '@/components/Elements/Spinner';
import { SideNavbar } from '@/components/Layouts/Navbar/Layout/SideNavbar';
import { TopNavbar } from '@/components/Layouts/Navbar/Layout/TopNavbar';
import { RemoteControlBar } from '@/components/Layouts/ControlBar/RemoteControlBar';
import { initFrontendLogger } from '@/utils/logs/frontend-logger';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    useEffect(() => {
        initFrontendLogger();
    }, []);

    if (pathname?.startsWith('/desktop/setup')) {
        return (
            <>
                <div className={`bg-slate-850 flex h-screen flex-col overflow-hidden`}>{children}</div>
            </>
        );
    }

    return (
        <div className={`bg-slate-850 flex h-screen flex-col overflow-hidden`}>
            <TopNavbar />
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <SideNavbar />
                <div className="min-h-0 w-full flex-1 overflow-auto">{children}</div>
            </div>
            <RemoteControlBar />
        </div>
    );
}
