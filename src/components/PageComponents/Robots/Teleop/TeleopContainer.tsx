import { RemoteRobotConfig } from '@/components/PageComponents/Robots/RemoteRobotConfig';
import { RemoteTeleopAction } from '@/components/PageComponents/Robots/Teleop/RemoteTeleopAction';

const REMOTE_ROBOT_TYPES = ['sourccey', 'lekiwi'];
export const TeleopContainer = ({ ownedRobot }: { ownedRobot: any }) => {
    return (
        <div className="mb-20 flex w-full flex-col gap-6 p-6">
            <RemoteRobotTeleop ownedRobot={ownedRobot} />
        </div>
    );
};

export const RemoteRobotTeleop = ({ ownedRobot }: { ownedRobot: any }) => {
    return (
        <>
            <RemoteRobotConfig ownedRobot={ownedRobot} onClose={() => {}} />
            <RemoteTeleopAction ownedRobot={ownedRobot} onClose={() => {}} logs={true} />
        </>
    );
};
