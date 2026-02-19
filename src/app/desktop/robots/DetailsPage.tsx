'use client';

import { Spinner } from '@/components/Elements/Spinner';
import { RemoteTeleopContainer } from '@/components/PageComponents/Robots/Teleop/TeleopContainer';
import { Overview } from '@/components/PageComponents/Robots/Overview/Overview';
import { RemoteConfigSection } from '@/components/PageComponents/Robots/Config/RemoteConfigSection';
import { RobotLayout } from '@/components/PageComponents/Robots/RobotLayout';
import { useSelectedOwnedRobot } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import { useGetContent } from '@/hooks/Components/OwnedRobots/owned-robots.hook';
import { AIModelContainer } from '@/components/PageComponents/Robots/AI/AIContainer';

export const RobotDetailsPage = () => {
    const { data: ownedRobot, isLoading } = useSelectedOwnedRobot();
    const { data: content } = useGetContent();
    const activeContent = (content as string) ?? 'overview';

    if (!ownedRobot || isLoading) {
        return (
            <div className="flex h-24 w-full items-center justify-center">
                <Spinner />
            </div>
        );
    }

    return (
        <RobotLayout>
            <div className="flex h-full w-full flex-col space-y-4 overflow-y-auto p-4">
                {activeContent === 'overview' && <Overview ownedRobot={ownedRobot} />}
                {activeContent === 'teleoperate' && <RemoteTeleopContainer ownedRobot={ownedRobot} />}
                {activeContent === 'ai' && <AIModelContainer ownedRobot={ownedRobot} />}
                {activeContent === 'config' && <RemoteConfigSection ownedRobot={ownedRobot} embedded={true} showHeader={false} isOpen={true} />}
            </div>
        </RobotLayout>
    );
};
