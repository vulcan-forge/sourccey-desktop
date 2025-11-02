import { RobotConfig } from '@/components/PageComponents/OwnedRobots/RobotConfig';
import { RecordAction } from '@/components/PageComponents/OwnedRobots/Record/RecordAction';
import { RecordConfig } from '@/components/PageComponents/OwnedRobots/Record/RecordConfig';
import { RemoteRobotConfig } from '@/components/PageComponents/OwnedRobots/RemoteRobotConfig';
import { RemoteRecordAction } from '@/components/PageComponents/OwnedRobots/Record/RemoteRecordAction';
import { RemoteRecordConfig } from '@/components/PageComponents/OwnedRobots/Record/RemoteRecordConfig';

export const RecordContainer = ({ ownedRobot }: { ownedRobot: any }) => {
    if (!ownedRobot) return <></>;

    const isRemote = ownedRobot?.robot?.robot_type === 'sourccey';
    return (
        <div className="mb-20 flex w-full flex-col gap-6 p-6">
            {isRemote ? <RemoteRobotRecord ownedRobot={ownedRobot} /> : <RobotRecord ownedRobot={ownedRobot} />}
        </div>
    );
};

export const RobotRecord = ({ ownedRobot }: { ownedRobot: any }) => {
    return (
        <>
            <RobotConfig ownedRobot={ownedRobot} />
            <RecordConfig ownedRobot={ownedRobot} />
            <RecordAction ownedRobot={ownedRobot} logs={true} />
        </>
    );
};

export const RemoteRobotRecord = ({ ownedRobot }: { ownedRobot: any }) => {
    return (
        <>
            <RemoteRobotConfig ownedRobot={ownedRobot} onClose={() => {}} />
            <RemoteRecordConfig ownedRobot={ownedRobot} />
            <RemoteRecordAction ownedRobot={ownedRobot} logs={true} />
        </>
    );
};
