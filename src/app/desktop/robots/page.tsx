'use client';

import { RobotListPage } from '@/app/desktop/robots/ListPage';
import { RobotDetailsPage } from '@/app/desktop/robots/DetailsPage';
import { useSearchParams } from 'next/navigation';

export default function RobotsPage() {
    const searchParams = useSearchParams();
    const id = searchParams.get('id');

    return (
        <div className="flex h-screen flex-col">
            {id ? <RobotDetailsPage /> : <RobotListPage />}
        </div>
    );
}
