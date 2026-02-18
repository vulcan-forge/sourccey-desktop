<<<<<<< HEAD
import { TeleopAction } from '@/components/PageComponents/Robots/Teleop/TeleopAction';
import { RobotConfig } from '@/components/PageComponents/Robots/RobotConfig';
=======
>>>>>>> run-ai
import { RemoteRobotConfig } from '@/components/PageComponents/Robots/RemoteRobotConfig';
import { RemoteTeleopAction } from '@/components/PageComponents/Robots/Teleop/RemoteTeleopAction';

const REMOTE_ROBOT_TYPES = ['sourccey', 'lekiwi'];
export const TeleopContainer = ({ ownedRobot }: { ownedRobot: any }) => {
<<<<<<< HEAD
    if (!ownedRobot) return <></>;

    const isRemote = REMOTE_ROBOT_TYPES.includes(ownedRobot?.robot?.robot_type);
    return (
        <div className="mb-20 flex w-full flex-col gap-6 p-6">
            {isRemote ? <RemoteRobotTeleop ownedRobot={ownedRobot} /> : <RobotTeleop ownedRobot={ownedRobot} />}
=======
    return (
        <div className="mb-20 flex w-full flex-col gap-6 p-6">
            <RemoteRobotTeleop ownedRobot={ownedRobot} />
>>>>>>> run-ai
        </div>
    );
};

<<<<<<< HEAD
export const RobotTeleop = ({ ownedRobot }: { ownedRobot: any }) => {
    return (
        <>
            <RobotConfig ownedRobot={ownedRobot} />
            <TeleopAction ownedRobot={ownedRobot} onClose={() => {}} logs={true} />
        </>
    );
};

=======
>>>>>>> run-ai
export const RemoteRobotTeleop = ({ ownedRobot }: { ownedRobot: any }) => {
    return (
        <>
            <RemoteRobotConfig ownedRobot={ownedRobot} onClose={() => {}} />
            <RemoteTeleopAction ownedRobot={ownedRobot} onClose={() => {}} logs={true} />
        </>
    );
};
