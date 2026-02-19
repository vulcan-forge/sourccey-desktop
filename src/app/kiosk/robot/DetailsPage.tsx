'use client';

import React from 'react';
import { RobotControl } from '@/components/Elements/RemoteRobot/RobotControl';
import { useGetCalibration } from '@/hooks/Control/config.hook';
import { useSelectedRobot } from '@/hooks/Robot/selected-robot.hook';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import type { Calibration } from '@/components/PageComponents/Robots/Config/RobotConfig';

export const KioskRobotDetailsPage: React.FC = () => {
    const { isKioskMode } = useAppMode();
    const { data: selectedRobot } = useSelectedRobot();

    const nickname = selectedRobot?.nickname || (isKioskMode ? 'sourccey' : '');
    const robotType = selectedRobot?.robotType || (isKioskMode ? 'sourccey' : '');

    const followerType = robotType ? `${robotType}_follower` : '';
    const rightArmNickname = nickname ? `${nickname}_right` : '';
    const leftArmNickname = nickname ? `${nickname}_left` : '';

    const { data: rightArmCalibration }: any = useGetCalibration(followerType, rightArmNickname, !!followerType && !!rightArmNickname);
    const { data: leftArmCalibration }: any = useGetCalibration(followerType, leftArmNickname, !!followerType && !!leftArmNickname);
    const { data: singleCalibration }: any = useGetCalibration(robotType, nickname, !!robotType && !!nickname);

    let combinedCalibration: Calibration | null = null;

    if (leftArmCalibration?.[0] || rightArmCalibration?.[0]) {
        combinedCalibration = {} as Calibration;

        if (leftArmCalibration?.[0]) {
            for (const [key, value] of Object.entries(leftArmCalibration[0] as Calibration)) {
                combinedCalibration[`left_${key}`] = value;
            }
        }

        if (rightArmCalibration?.[0]) {
            for (const [key, value] of Object.entries(rightArmCalibration[0] as Calibration)) {
                combinedCalibration[`right_${key}`] = value;
            }
        }
    } else if (singleCalibration?.[0]) {
        combinedCalibration = singleCalibration[0] as Calibration;
    }

    return (
        <div className="bg-slate-850 flex h-screen flex-col">
            <div className="w-full p-6">
                <RobotControl nickname={nickname} robotType={robotType} calibration={combinedCalibration} />
            </div>
        </div>
    );
};
