'use client';

import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { SideNavbar as DesktopSideNavbar } from '@/components/Layouts/Navbar/Layout/Desktop/SideNavbar';
import { SideNavbar as KioskSideNavbar } from '@/components/Layouts/Navbar/Layout/Kiosk/SideNavbar';

export const SideNavbar = () => {
    const { isKioskMode } = useAppMode();
    if (isKioskMode) {
        return <KioskSideNavbar />;
    } else {
        return <DesktopSideNavbar />;
    }
};
