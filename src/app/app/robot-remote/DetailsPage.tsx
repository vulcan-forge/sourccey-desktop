'use client';

import React from 'react';
import { RobotKioskCalibration } from '@/components/Elements/RemoteRobot/CalibrationSection';
import { RobotControl } from '@/components/Elements/RemoteRobot/RobotControl';
import { useGetCalibration, useGetIsCalibrated } from '@/hooks/Control/config.hook';

export const KioskRobotDetailsPage: React.FC = () => {
    const nickname = 'sourccey';
    const robotType = 'sourccey';

    const { data: calibration }: any = useGetCalibration(nickname);
    const { data: isCalibrated }: any = useGetIsCalibrated();

    console.log(isCalibrated);
    console.log(calibration);

    return (
        <div className="bg-slate-850 flex h-screen flex-col">
            <div className="w-full space-y-4 p-6">
                <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold">Robot Calibration:</h1>
                    <span className="text-sm text-slate-400">{isCalibrated ? 'Calibrated' : 'Not Calibrated'}</span>
                </div>
                {isCalibrated && calibration && <RobotControl nickname={nickname} />}
                <RobotKioskCalibration nickname={nickname} robotType={robotType} calibration={calibration} />
            </div>
        </div>
    );
};
