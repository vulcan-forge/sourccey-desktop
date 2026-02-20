'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { RobotListPage } from '@/app/desktop/robots/ListPage';
import { RobotDetailsPage } from '@/app/desktop/robots/DetailsPage';
import { setSelectedOwnedRobot, useGetOwnedRobot } from '@/hooks/Models/OwnedRobot/owned-robot.hook';

function RobotsPageContent() {
    const searchParams = useSearchParams();
    const id = searchParams.get('id');
    const { data: ownedRobot } = useGetOwnedRobot(id, !!id);

    useEffect(() => {
        if (!ownedRobot) return;
        setSelectedOwnedRobot(ownedRobot);
    }, [ownedRobot]);

    if (id) {
        return (
            <div className="flex h-screen flex-col">
                <RobotDetailsPage />
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col">
            <RobotListPage />
        </div>
    );
}

export default function RobotsPage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center text-slate-400">Loading...</div>}>
            <RobotsPageContent />
        </Suspense>
    );
}
