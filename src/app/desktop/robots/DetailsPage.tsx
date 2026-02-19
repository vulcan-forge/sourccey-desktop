'use client';

import { Spinner } from '@/components/Elements/Spinner';
import { RemoteRobotTeleop } from '@/components/PageComponents/Robots/Teleop/TeleopContainer';
import { useSelectedOwnedRobot } from '@/hooks/Models/OwnedRobot/owned-robot.hook';

export const RobotDetailsPage = () => {
    const { data: ownedRobot, isLoading } = useSelectedOwnedRobot();

    if (!ownedRobot || isLoading) {
        return (
            <div className="flex h-24 w-full items-center justify-center">
                <Spinner />
            </div>
        );
    }

    return (
        <div className="flex h-full w-full flex-col space-y-4 overflow-y-auto p-6">
            <RemoteRobotTeleop ownedRobot={ownedRobot} />
        </div>
    );
};
