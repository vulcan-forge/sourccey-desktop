import { useState } from 'react';
import { RemoteTeleopAction } from '@/components/PageComponents/Robots/Teleop/RemoteTeleopAction';

export const RemoteRobotTeleop = ({ ownedRobot }: { ownedRobot: any }) => {
    const nickname = ownedRobot?.nickname ?? '';

    return (
        <>
            <RemoteTeleopAction ownedRobot={ownedRobot} onClose={() => {}} logs={true} />
        </>
    );
};
