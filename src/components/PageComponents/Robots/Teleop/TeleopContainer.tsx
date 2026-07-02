import { RemoteTeleopAction } from '@/components/PageComponents/Robots/Teleop/RemoteTeleopAction';
import { RobotLogs } from '@/components/PageComponents/Robots/Logs/RobotDesktopLogs';
import { RemoteControlType, RemoteRobotStatus, useGetRemoteRobotState } from '@/hooks/Control/remote-control.hook';

type RemoteTeleopContainerProps = {
    ownedRobot: any;
    mode?: 'teleoperation' | 'recording';
};

export const RemoteTeleopContainer = ({ ownedRobot, mode = 'teleoperation' }: RemoteTeleopContainerProps) => {
    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = nickname.startsWith('@') ? nickname.slice(1) : nickname;
    const { data: remoteRobotState }: any = useGetRemoteRobotState(nickname);
    const robotStatus = remoteRobotState?.status;
    const controlType = remoteRobotState?.controlType;
    const isControlling =
        (robotStatus == RemoteRobotStatus.STARTED || robotStatus == RemoteRobotStatus.STARTING) &&
        (mode === 'recording' ? controlType == RemoteControlType.RECORDING : controlType == RemoteControlType.TELEOP);

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <RemoteTeleopAction
                ownedRobot={ownedRobot}
                onClose={() => {}}
                mode={mode}
                logsSlot={
                    <RobotLogs isControlling={isControlling} nickname={normalizedNickname} embedded={true} mode={mode} />
                }
            />
        </div>
    );
};
