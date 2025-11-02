'use client';

import { MyRobots } from '@/components/PageComponents/Home/Desktop/MyRobots';
import { HomeWelcome as DesktopHomeWelcome } from '@/components/PageComponents/Home/Desktop/Welcome';
import { HomeWelcome as KioskHomeWelcome } from '@/components/PageComponents/Home/Kiosk/Welcome';
import { TrainAI } from '@/components/PageComponents/Home/Desktop/TrainAI';
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
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                    <MyRobots />
                    <TrainAI />
                </div>
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
