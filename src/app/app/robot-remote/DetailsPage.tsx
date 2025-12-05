'use client';

import React from 'react';
import { RobotKioskCalibration } from '@/components/Elements/RemoteRobot/CalibrationSection';
import { RobotControl } from '@/components/Elements/RemoteRobot/RobotControl';
import { useGetCalibration } from '@/hooks/Control/config.hook';

export const KioskRobotDetailsPage: React.FC = () => {
    const nickname = 'sourccey';
    const rightArmNickname = 'sourccey_right';
    const leftArmNickname = 'sourccey_left';

    const robotType = 'sourccey';
    const followerType = 'sourccey_follower';

    const { data: rightArmCalibration }: any = useGetCalibration(followerType, rightArmNickname);
    const { data: leftArmCalibration }: any = useGetCalibration(followerType, leftArmNickname);

    console.log('--------------------------------');
    console.log('followerType', followerType);
    console.log('rightArmNickname', rightArmNickname);
    console.log('leftArmNickname', leftArmNickname);
    console.log('rightArmCalibration', rightArmCalibration);
    console.log('leftArmCalibration', leftArmCalibration);
    console.log('--------------------------------');

    // const combinedCalibration = {
    //     ...rightArmCalibration.calibration,
    //     ...leftArmCalibration.calibration,
    // };

    // console.log(combinedCalibration);

    return (
        <div className="bg-slate-850 flex h-screen flex-col">
            <div className="w-full space-y-4 p-6">
                {/* <RobotControl nickname={nickname} /> */}
                {/* <RobotKioskCalibration nickname={nickname} robotType={robotType} calibration={combinedCalibration} /> */}
            </div>
        </div>
    );
};
