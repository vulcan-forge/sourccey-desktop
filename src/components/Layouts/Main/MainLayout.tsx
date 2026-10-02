'use client';

import { VirtualKeyboard } from '@/components/Elements/VirtualKeyboard';
import { ToastCloseButton } from '@/utils/toast/ToastComponents';
import { usePathname } from 'next/navigation';
import { ToastContainer } from 'react-toastify';
import FirstTimePasswordModal from '@/components/Elements/Modals/FirstTimePasswordModal';

const AppToastContainer = () => <ToastContainer autoClose={3000} closeOnClick closeButton={ToastCloseButton} theme="dark" />;

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
            <AppToastContainer />
        </div>
    );
};

export const KioskLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div>
            <div>{children}</div>
            <FirstTimePasswordModal />
            <VirtualKeyboard />
            <AppToastContainer />
        </div>
    );
};
