'use client';

import { OwnedRobotLayout } from '@/components/PageComponents/OwnedRobots/OwnedRobotLayout';

import { Overview } from '@/components/PageComponents/OwnedRobots/Overview/Overview';
import { useGetContent } from '@/hooks/Components/OwnedRobots/owned-robots.hook';
import { useGetOwnedRobot } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import { TrainingContainer } from '@/components/PageComponents/OwnedRobots/Training/TrainingContainer';
import { TeleopContainer } from '@/components/PageComponents/OwnedRobots/Teleop/TeleopContainer';
import { RecordContainer } from '@/components/PageComponents/OwnedRobots/Record/RecordContainer';
import { ReplayContainer } from '@/components/PageComponents/OwnedRobots/Replay/ReplayContainer';
import { EvaluateContainer } from '@/components/PageComponents/OwnedRobots/Evaluate/EvaluateContainer';
import { setConfig } from '@/hooks/Control/config.hook';
import { useEffect } from 'react';

export const OwnedRobotDetailPage = ({ id }: { id: string }) => {
    return (
        <OwnedRobotLayout>
            <OwnedRobotDetail id={id} />
        </OwnedRobotLayout>
    );
};

const OwnedRobotDetail = ({ id }: { id: string }) => {
    const { data: ownedRobot }: any = useGetOwnedRobot(id);
    const { data: content } = useGetContent();

    useEffect(() => {
        const loadConfig = async () => {
            if (!ownedRobot) return;
            await setConfig(ownedRobot?.nickname ?? '', null);
        };
        loadConfig();
    }, [ownedRobot]);

    const isOverviewActive = content === 'overview';
    const isControlActive = content === 'control';
    const isRecordActive = content === 'record';
    const isReplayActive = content === 'replay';
    const isTrainingActive = content === 'training';
    const isEvaluationActive = content === 'evaluate';

    const repoDir = ownedRobot?.nickname;
    return (
        <div className="bg-slate-850 flex min-h-screen flex-col">
            {isOverviewActive && <Overview ownedRobot={ownedRobot} />}
            {isControlActive && <TeleopContainer ownedRobot={ownedRobot} />}
            {isRecordActive && <RecordContainer ownedRobot={ownedRobot} />}
            {isReplayActive && <ReplayContainer ownedRobot={ownedRobot} />}
            {isTrainingActive && <TrainingContainer repoDir={repoDir} />}
            {isEvaluationActive && <EvaluateContainer ownedRobot={ownedRobot} />}
        </div>
    );
};
