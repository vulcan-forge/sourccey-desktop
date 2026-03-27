'use client';

import React from 'react';
import { RobotControl } from '@/components/Elements/RemoteRobot/RobotControl';
import { KioskManualDrivePad } from '@/components/Elements/RemoteRobot/KioskManualDrivePad';
import { useGetCalibration } from '@/hooks/Control/config.hook';
import { useSelectedRobot } from '@/hooks/Robot/selected-robot.hook';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { useRobotStatus } from '@/context/robot-status-context';

export const KioskRobotDetailsPage: React.FC = () => {
    const { isKioskMode } = useAppMode();
    const { data: selectedRobot } = useSelectedRobot();
    const { isRobotStarted } = useRobotStatus();

    const nickname = selectedRobot?.nickname || (isKioskMode ? 'sourccey' : '');
    const robotType = selectedRobot?.robotType || (isKioskMode ? 'sourccey' : '');

    const followerType = robotType ? `${robotType}_follower` : '';
    const rightArmNickname = nickname ? `${nickname}_right` : '';
    const leftArmNickname = nickname ? `${nickname}_left` : '';

    const { data: rightArmCalibration }: any = useGetCalibration(followerType, rightArmNickname, !!followerType && !!rightArmNickname);
    const { data: leftArmCalibration }: any = useGetCalibration(followerType, leftArmNickname, !!followerType && !!leftArmNickname);
    const { data: singleCalibration }: any = useGetCalibration(robotType, nickname, !!robotType && !!nickname);

    let combinedCalibration: any | null = null;

    if (leftArmCalibration?.[0] || rightArmCalibration?.[0]) {
        combinedCalibration = {} as any;

        if (leftArmCalibration?.[0]) {
            for (const [key, value] of Object.entries(leftArmCalibration[0] as any)) {
                combinedCalibration[`left_${key}`] = value;
            }
        }

        if (rightArmCalibration?.[0]) {
            for (const [key, value] of Object.entries(rightArmCalibration[0] as any)) {
                combinedCalibration[`right_${key}`] = value;
            }
        }
    } else if (singleCalibration?.[0]) {
        combinedCalibration = singleCalibration[0] as any;
    }

    return (
        <div className="bg-slate-850 flex h-screen flex-col">
            <div className="w-full p-6">
                <RobotControl nickname={nickname} robotType={robotType} calibration={combinedCalibration} />
                {isRobotStarted && !!nickname && <KioskManualDrivePad nickname={nickname} />}
            </div>
        </div>
    );
};
