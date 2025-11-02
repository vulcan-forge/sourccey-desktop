import { EvaluateAction } from '@/components/PageComponents/OwnedRobots/Evaluate/EvaluateAction';
import { EvaluateConfig } from '@/components/PageComponents/OwnedRobots/Evaluate/EvaluateConfig';
import { RemoteEvaluateAction } from '@/components/PageComponents/OwnedRobots/Evaluate/RemoteEvaluateAction';
import { RemoteEvaluateConfig } from '@/components/PageComponents/OwnedRobots/Evaluate/RemoteEvaluateConfig';
import { RemoteRobotConfig } from '@/components/PageComponents/OwnedRobots/RemoteRobotConfig';
import { RobotConfig } from '@/components/PageComponents/OwnedRobots/RobotConfig';

export const EvaluateContainer = ({ ownedRobot }: { ownedRobot: any }) => {
    const isRemote = ownedRobot?.robot?.robot_type === 'sourccey';
    return (
        <div className="mb-20 flex w-full flex-col gap-6 p-6">
            {isRemote ? <RemoteEvaluateControl ownedRobot={ownedRobot} /> : <EvaluateControl ownedRobot={ownedRobot} />}
        </div>
    );
};

export const EvaluateControl = ({ ownedRobot }: { ownedRobot: any }) => {
    return (
        <>
            <RobotConfig ownedRobot={ownedRobot} />
            <EvaluateConfig ownedRobot={ownedRobot} />
            <EvaluateAction ownedRobot={ownedRobot} onClose={() => {}} logs={true} />
        </>
    );
};

export const RemoteEvaluateControl = ({ ownedRobot }: { ownedRobot: any }) => {
    return (
        <>
            <RemoteRobotConfig ownedRobot={ownedRobot} onClose={() => {}} />
            <RemoteEvaluateConfig ownedRobot={ownedRobot} />
            <RemoteEvaluateAction ownedRobot={ownedRobot} onClose={() => {}} logs={true} />
        </>
    );
};
