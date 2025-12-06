'use client';

import React from 'react';
import { RobotKioskCalibration } from '@/components/Elements/RemoteRobot/CalibrationSection';
import { RobotControl } from '@/components/Elements/RemoteRobot/RobotControl';
import { useGetCalibration } from '@/hooks/Control/config.hook';
import type { Calibration } from '@/components/PageComponents/OwnedRobots/RobotConfig';

const expectedKeys = [
    'left_shoulder_pan',
    'left_shoulder_lift',
    'left_elbow_flex',
    'left_wrist_flex',
    'left_wrist_roll',
    'left_gripper',
    'right_shoulder_pan',
    'right_shoulder_lift',
    'right_elbow_flex',
    'right_wrist_flex',
    'right_wrist_roll',
    'right_gripper',
];

export const KioskRobotDetailsPage: React.FC = () => {
    const nickname = 'sourccey';
    const rightArmNickname = 'sourccey_right';
    const leftArmNickname = 'sourccey_left';

    const robotType = 'sourccey';
    const followerType = 'sourccey_follower';

    const { data: rightArmCalibration }: any = useGetCalibration(followerType, rightArmNickname);
    const { data: leftArmCalibration }: any = useGetCalibration(followerType, leftArmNickname);

    const combinedCalibration: Calibration = {} as Calibration;
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

    // Does the combined calibration have all the keys?
    const combinedKeys = Object.keys(combinedCalibration);
    const hasAllKeys = expectedKeys.every((key) => combinedKeys.includes(key));
    const isCalibrated = rightArmCalibration?.[1] && leftArmCalibration?.[1] && hasAllKeys;

    return (
        <div className="bg-slate-850 flex h-screen flex-col">
            <div className="w-full space-y-4 p-6">
                {isCalibrated && <RobotControl nickname={nickname} />}
                <RobotKioskCalibration nickname={nickname} robotType={robotType} calibration={combinedCalibration} />
            </div>
        </div>
    );
};
