import { RemoteTeleopAction } from '@/components/PageComponents/Robots/Teleop/RemoteTeleopAction';
import { RobotLogs } from '@/components/PageComponents/Robots/Logs/RobotDesktopLogs';
import { RemoteControlType, RemoteRobotStatus, useGetRemoteRobotState } from '@/hooks/Control/remote-control.hook';

export const RemoteTeleopContainer = ({ ownedRobot }: { ownedRobot: any }) => {
    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = nickname.startsWith('@') ? nickname.slice(1) : nickname;
    const { data: remoteRobotState }: any = useGetRemoteRobotState(nickname);
    const robotStatus = remoteRobotState?.status;
    const controlType = remoteRobotState?.controlType;
    const isControlling = robotStatus == RemoteRobotStatus.STARTED && controlType == RemoteControlType.TELEOP;

    return (
        <div className="flex flex-col gap-4">
            <RemoteTeleopAction
                ownedRobot={ownedRobot}
                onClose={() => {}}
                logsSlot={
                    <RobotLogs isControlling={isControlling} nickname={normalizedNickname} embedded={true} />
                }
            />
        </div>
    );
};
