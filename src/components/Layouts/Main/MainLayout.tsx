'use client';

import { VirtualKeyboard } from '@/components/Elements/VirtualKeyboard';
import { ToastCloseButton } from '@/utils/toast/ToastComponents';
import { ToastContainer } from 'react-toastify';
import { usePathname } from 'next/navigation';

export function MainLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() ?? '';
    const isKioskRoute = pathname.startsWith('/kiosk');

    if (isKioskRoute) {
        return <KioskLayout>{children}</KioskLayout>;
    } else {
        return <DesktopLayout>{children}</DesktopLayout>;
    }
}

export const DesktopLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div>
            <div>{children}</div>
            <ToastContainer closeButton={ToastCloseButton} />
        </div>
    );
};

export const KioskLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div>
            <div>{children}</div>
            <VirtualKeyboard />
            <ToastContainer closeButton={ToastCloseButton} />
        </div>
    );
};

export default MainLayout;
