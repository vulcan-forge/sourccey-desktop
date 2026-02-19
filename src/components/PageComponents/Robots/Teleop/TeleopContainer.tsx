import { useState } from 'react';
import { RemoteTeleopAction } from '@/components/PageComponents/Robots/Teleop/RemoteTeleopAction';
import { RobotLogs } from '@/components/PageComponents/Robots/Logs/RobotDesktopLogs';
import { ControlType, useGetControlledRobot } from '@/hooks/Control/control.hook';

export const RemoteRobotTeleop = ({ ownedRobot }: { ownedRobot: any }) => {
    const nickname = ownedRobot?.nickname ?? '';
    const { data: controlledRobot }: any = useGetControlledRobot(nickname);
    const isTeleopRunning = !!controlledRobot?.ownedRobot && controlledRobot?.controlType === ControlType.TELEOP;

    return (
        <>
            <RemoteTeleopAction ownedRobot={ownedRobot} onClose={() => {}} logs={true} />
            <RobotLogs isControlling={isTeleopRunning} nickname={nickname} />
        </>
    );
};
