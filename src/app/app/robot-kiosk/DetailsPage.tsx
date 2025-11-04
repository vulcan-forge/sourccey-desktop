'use client';

import React from 'react';
import { RobotKioskCalibration } from '@/components/Elements/RobotKiosk/CalibrationSection';
import { RobotControl } from '@/components/Elements/RobotKiosk/RobotControl';
import { useGetCalibration, useGetIsCalibrated } from '@/hooks/Control/config.hook';
import { FaCheck, FaExclamationTriangle } from 'react-icons/fa';

export const KioskRobotDetailsPage: React.FC = () => {
    const nickname = 'sourccey';
    const robotType = 'sourccey';

    const { data: calibration }: any = useGetCalibration(nickname);
    const { data: isCalibrated }: any = useGetIsCalibrated();

    return (
        <div className="bg-slate-850 flex h-screen flex-col">
            <div className="w-full space-y-4 p-6">
                {isCalibrated && calibration && <RobotControl nickname={nickname} />}
                <RobotKioskCalibration nickname={nickname} robotType={robotType} calibration={calibration} />
            </div>
        </div>
    );
};
