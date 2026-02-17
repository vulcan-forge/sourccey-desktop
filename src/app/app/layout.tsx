'use client';

import { Spinner } from '@/components/Elements/Spinner';
import { SideNavbar } from '@/components/Layouts/Navbar/Layout/SideNavbar';
import { TopNavbar } from '@/components/Layouts/Navbar/Layout/TopNavbar';
import { ControlBar } from '@/components/Layouts/ControlBar/ControlBar';
import { RemoteControlBar } from '@/components/Layouts/ControlBar/RemoteControlBar';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { usePathname } from 'next/navigation';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { isKioskMode, isLoading: isLoadingAppMode } = useAppMode();
    const pathname = usePathname();

    // Define pages where you don't want the sidebar to show
    // Use exact path matching for specific sub-pages
    const pagesWithoutSidebar = [
        '/app/data/', // This will match /app/data/[name] but not /app/data
        '/app/ai-models/', // This will match /app/ai-models/[name] but not /app/ai-models
    ];

    // Check if current path should hide sidebar
    const shouldShowSidebar = !pagesWithoutSidebar.some((path) => {
        // For paths ending with '/', we want to match sub-pages but not the exact path
        if (path.endsWith('/')) {
            const basePath = path.slice(0, -1); // Remove trailing slash
            return pathname.startsWith(path) && pathname !== basePath;
        }
        // For exact paths, use exact matching
        return pathname === path;
    });

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
                {shouldShowSidebar && <SideNavbar />}
                <div className={`min-h-0 overflow-auto ${shouldShowSidebar ? 'flex-1' : 'w-full'}`}>{children}</div>
            </div>
            <ControlBar />
            <RemoteControlBar />
        </div>
    );
}
