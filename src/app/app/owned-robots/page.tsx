'use client';

import { useQueryRouter } from '@/hooks/Router/Robot/robot.query';
import { MyRobotListPage } from '@/app/app/owned-robots/ListPage';
import { OwnedRobotDetailPage } from '@/app/app/owned-robots/DetailPage';
import React from 'react';

export default function MyRobotsPage() {
    const { id } = useQueryRouter();

    return <div className="flex h-screen flex-col">{id ? <OwnedRobotDetailPage id={id} /> : <MyRobotListPage />}</div>;
}
