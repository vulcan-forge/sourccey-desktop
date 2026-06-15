'use client';

import { Spinner } from '@/components/Elements/Spinner';
import { RemoteConfigSection } from '@/components/PageComponents/Robots/Config/RemoteConfigSection';
import { RobotLayout } from '@/components/PageComponents/Robots/RobotLayout';
import { useSelectedOwnedRobot } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import { useGetContent } from '@/hooks/Components/OwnedRobots/owned-robots.hook';
import { RobotOperationsWorkspace } from '@/components/PageComponents/Robots/Operations/RobotOperationsWorkspace';

export const RobotDetailsPage = () => {
    const { data: ownedRobot } = useSelectedOwnedRobot();
    const { data: content } = useGetContent();
    const activeContent = (content as string) ?? 'teleoperate';
    const showConfigContent = activeContent === 'config' || activeContent === 'calibration';
    const showOperationsWorkspace =
        activeContent === 'overview' || activeContent === 'teleoperate' || activeContent === 'recording' || activeContent === 'rollout';
    const workspaceContent = activeContent === 'overview' ? 'teleoperate' : activeContent;

    if (!ownedRobot) {
        return (
            <div className="flex h-24 w-full items-center justify-center">
                <Spinner />
            </div>
        );
    }

    return (
        <RobotLayout>
            {showOperationsWorkspace && <RobotOperationsWorkspace ownedRobot={ownedRobot} activeContent={workspaceContent} />}
            {showConfigContent && (
                <div className="flex h-full w-full flex-col space-y-4 overflow-y-auto p-4">
                    <RemoteConfigSection ownedRobot={ownedRobot} embedded={true} showHeader={false} isOpen={true} />
                </div>
            )}
        </RobotLayout>
    );
};
