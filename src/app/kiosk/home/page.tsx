'use client';

import { HomeWelcome } from '@/components/PageComponents/Home/Kiosk/Welcome';

export default function KioskHomePage() {
    return (
        <div className="min-h-full bg-slate-900/30">
            <div className="flex flex-col gap-6 px-8 py-8">
                <HomeWelcome />
            </div>
        </div>
    );
}
