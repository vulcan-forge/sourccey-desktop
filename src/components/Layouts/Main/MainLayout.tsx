'use client';

import { RobotStatusProvider } from '@/context/robot-status-context';
import { VirtualKeyboardProvider } from '@/context/virtual-keyboard-context';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { VirtualKeyboard } from '@/components/Elements/VirtualKeyboard';
import { ToastCloseButton } from '@/utils/toast/ToastComponents';
import { ToastContainer } from 'react-toastify';

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
    const { isKioskMode } = useAppMode();
    if (isKioskMode) {
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
