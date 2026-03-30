'use client';

import { VirtualKeyboard } from '@/components/Elements/VirtualKeyboard';
import { ToastCloseButton } from '@/utils/toast/ToastComponents';
import { usePathname } from 'next/navigation';
import { ToastContainer } from 'react-toastify';

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
    const pathname = usePathname();
    const isKioskRoute = pathname?.startsWith('/kiosk') ?? false;
    if (isKioskRoute) {
        return <KioskLayout>{children}</KioskLayout>;
    } else {
        return <DesktopLayout>{children}</DesktopLayout>;
    }
};

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
