import { RemoteRobotConfig } from '@/components/PageComponents/OwnedRobots/RemoteRobotConfig';
import { RemoteReplayAction } from '@/components/PageComponents/OwnedRobots/Replay/RemoteReplayAction';
import { RemoteReplayConfig } from '@/components/PageComponents/OwnedRobots/Replay/RemoteReplayConfig';
import { ReplayAction } from '@/components/PageComponents/OwnedRobots/Replay/ReplayAction';
import { ReplayConfig } from '@/components/PageComponents/OwnedRobots/Replay/ReplayConfig';
import { RobotConfig } from '@/components/PageComponents/OwnedRobots/RobotConfig';

export const ReplayContainer = ({ ownedRobot }: { ownedRobot: any }) => {
    const isRemote = ownedRobot?.robot?.robot_type === 'sourccey';
    return (
        <div className="mb-20 flex w-full flex-col gap-6 p-6">
            {isRemote ? <RemoteReplayControl ownedRobot={ownedRobot} /> : <ReplayControl ownedRobot={ownedRobot} />}
        </div>
    );
};

export const ReplayControl = ({ ownedRobot }: { ownedRobot: any }) => {
    return (
        <>
            <RobotConfig ownedRobot={ownedRobot} />
            <ReplayConfig ownedRobot={ownedRobot} />
            <ReplayAction ownedRobot={ownedRobot} onClose={() => {}} logs={true} />
        </>
    );
};

export const RemoteReplayControl = ({ ownedRobot }: { ownedRobot: any }) => {
    return (
        <>
            <RemoteRobotConfig ownedRobot={ownedRobot} onClose={() => {}} />
            <RemoteReplayConfig ownedRobot={ownedRobot} />
            <RemoteReplayAction ownedRobot={ownedRobot} onClose={() => {}} logs={true} />
        </>
    );
};
