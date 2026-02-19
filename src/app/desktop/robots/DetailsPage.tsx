'use client';

import { Spinner } from '@/components/Elements/Spinner';
import { RobotLogs } from '@/components/PageComponents/Robots/Logs/RobotDesktopLogs';
import { RobotAction } from '@/components/PageComponents/Robots/RobotAction';
import { ControlType, setControlledRobot, useGetControlledRobot } from '@/hooks/Control/control.hook';
import { useSelectedOwnedRobot } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { FaPlay, FaTools } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { RemoteTeleopAction } from '@/components/PageComponents/Robots/Teleop/RemoteTeleopAction';

export const RobotDetailsPage = () => {
    const searchParams = useSearchParams();
    const id = searchParams.get('id') || '';
    const { data: ownedRobot, isLoading } = useSelectedOwnedRobot();
    const [activeTab, setActiveTab] = useState<'ai' | 'teleop'>('ai');

    if (!ownedRobot || isLoading) {
        return (
            <div className="flex h-24 w-full items-center justify-center">
                <Spinner />
            </div>
        );
    }

    return (
        <div className="flex h-full w-full flex-col space-y-4 overflow-y-auto p-6">
            <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 p-3">
                <button
                    type="button"
                    onClick={() => setActiveTab('ai')}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                        activeTab === 'ai' ? 'bg-orange-500/20 text-orange-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                >
                    <FaTools className="h-3.5 w-3.5" />
                    Run AI
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('teleop')}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                        activeTab === 'teleop' ? 'bg-blue-500/20 text-blue-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                >
                    <FaPlay className="h-3.5 w-3.5" />
                    Manual Control
                </button>
            </div>

            {activeTab === 'ai' && <RunAITab ownedRobot={ownedRobot} />}
            {activeTab === 'teleop' && <TeleoperateTab ownedRobot={ownedRobot} />}
        </div>
    );
};

const TeleoperateTab = ({ ownedRobot }: { ownedRobot: any }) => {
    const nickname = ownedRobot?.nickname ?? '';
    const { data: controlledRobot }: any = useGetControlledRobot(nickname);
    const isTeleopRunning = !!controlledRobot?.ownedRobot && controlledRobot?.controlType === ControlType.TELEOP;

    return (
        <div className="flex flex-col gap-4">
            <RemoteTeleopAction ownedRobot={ownedRobot} onClose={() => {}} logs={true} />
            <RobotLogs isControlling={isTeleopRunning} nickname={nickname} />
        </div>
    );
};

const RunAITab = ({ ownedRobot }: { ownedRobot: any }) => {
    const nickname = ownedRobot?.nickname ?? '';
    const { data: controlledRobot }: any = useGetControlledRobot(nickname);
    const isAiRunning = !!controlledRobot?.ownedRobot && controlledRobot?.controlType === ControlType.AIMODEL;
    const [isLoading, setIsLoading] = useState(false);

    const toggleControl = async () => {
        try {
            setIsLoading(true);
            if (isAiRunning) {
                setControlledRobot(nickname, ControlType.AIMODEL, null);
                toast.success('Stopped AI run.', { ...toastSuccessDefaults });
            } else {
                setControlledRobot(nickname, ControlType.AIMODEL, ownedRobot);
                toast.success('Started AI run.', { ...toastSuccessDefaults });
            }
        } catch (error) {
            console.error('Failed to toggle AI run:', error);
            toast.error('Failed to toggle AI run.', { ...toastErrorDefaults });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <RobotAction
                ownedRobot={ownedRobot}
                toggleControl={toggleControl}
                isLoading={isLoading}
                isControlling={isAiRunning}
                controlType={ControlType.AIMODEL}
                logs={true}
            />
            <RobotLogs isControlling={isAiRunning} nickname={nickname} />
        </div>
    );
};
