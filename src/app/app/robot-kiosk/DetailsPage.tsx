'use client';

import React from 'react';
import { RobotKioskCalibration } from '@/components/Elements/RobotKiosk/CalibrationSection';
import { RobotControl } from '@/components/Elements/RobotKiosk/RobotControl';
import { useGetCalibration } from '@/hooks/Control/config.hook';

export const KioskRobotDetailsPage: React.FC = () => {
    const nickname = 'sourccey';
    const robotType = 'sourccey';

    const { data: calibration }: any = useGetCalibration(nickname);
    console.log('calibration', calibration);
    return (
        <div className="bg-slate-850 flex h-screen flex-col">
            <div className="w-full space-y-4 p-6">
                <RobotKioskCalibration nickname={nickname} robotType={robotType} />
                {calibration && <RobotControl nickname={nickname} />}
            </div>
        </div>
    );
};
