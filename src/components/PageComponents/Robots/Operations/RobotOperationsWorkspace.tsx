'use client';

import { AIModelContainer } from '@/components/PageComponents/Robots/AI/AIContainer';
import { RemoteTeleopContainer } from '@/components/PageComponents/Robots/Teleop/TeleopContainer';
import { RemoteReplayAction } from '@/components/PageComponents/Robots/Replay/RemoteReplayAction';
import { FaDatabase, FaGamepad, FaPlayCircle, FaRobot } from 'react-icons/fa';

type RobotOperationsWorkspaceProps = {
    ownedRobot: any;
    activeContent: string;
};

type WorkspaceTab = {
    key: 'teleoperate' | 'recording' | 'replay' | 'rollout';
    label: string;
    icon: any;
};

const WORKSPACE_TABS: WorkspaceTab[] = [
    {
        key: 'teleoperate',
        label: 'Teleoperation',
        icon: FaGamepad,
    },
    {
        key: 'recording',
        label: 'Record Data',
        icon: FaDatabase,
    },
    {
        key: 'replay',
        label: 'Replay',
        icon: FaPlayCircle,
    },
    {
        key: 'rollout',
        label: 'Rollout',
        icon: FaRobot,
    },
];

export const RobotOperationsWorkspace = ({ ownedRobot, activeContent }: RobotOperationsWorkspaceProps) => {
    const activeTab = (WORKSPACE_TABS.find((tab) => tab.key === activeContent) ?? WORKSPACE_TABS[0]) as WorkspaceTab;

    return (
        <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4">
            {activeTab.key === 'teleoperate' && <RemoteTeleopContainer ownedRobot={ownedRobot} mode="teleoperation" />}
            {activeTab.key === 'recording' && <RemoteTeleopContainer ownedRobot={ownedRobot} mode="recording" />}
            {activeTab.key === 'replay' && <RemoteReplayAction ownedRobot={ownedRobot} />}
            {activeTab.key === 'rollout' && <AIModelContainer ownedRobot={ownedRobot} mode="rollout" />}
        </div>
    );
};
