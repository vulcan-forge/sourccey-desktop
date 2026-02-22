'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { RobotListPage } from '@/components/PageComponents/Robots/ListPage';
import { RobotDetailsPage } from '@/components/PageComponents/Robots/DetailsPage';
import { setSelectedOwnedRobot, useGetOwnedRobot } from '@/hooks/Models/OwnedRobot/owned-robot.hook';

function RobotPageContent() {
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

export default function RobotPage() {
    return (
        <Suspense fallback={null}>
            <RobotPageContent />
        </Suspense>
    );
}
