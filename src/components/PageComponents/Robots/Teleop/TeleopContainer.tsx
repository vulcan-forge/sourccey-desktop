import { RemoteTeleopAction } from '@/components/PageComponents/Robots/Teleop/RemoteTeleopAction';

export const RemoteTeleopContainer = ({ ownedRobot }: { ownedRobot: any }) => {
    return <RemoteTeleopAction ownedRobot={ownedRobot} onClose={() => {}} logs={true} />;
};
