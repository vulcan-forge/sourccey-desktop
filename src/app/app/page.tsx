'use client';

import { HomeWelcome as DesktopHomeWelcome } from '@/components/PageComponents/Home/Desktop/Welcome';
import { HomeWelcome as KioskHomeWelcome } from '@/components/PageComponents/Home/Kiosk/Welcome';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';

export default function AppPage() {
    const { isKioskMode } = useAppMode();
    if (isKioskMode) {
        return <KioskHomePage />;
    } else {
        return <DesktopHomePage />;
    }
}

const DesktopHomePage = () => {
    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto flex flex-col gap-8 px-8 py-8">
                <DesktopHomeWelcome />
            </div>
        </div>
    );
};

const KioskHomePage = () => {
    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto flex flex-col gap-8 px-8 py-8">
                <KioskHomeWelcome />
            </div>
        </div>
    );
};
