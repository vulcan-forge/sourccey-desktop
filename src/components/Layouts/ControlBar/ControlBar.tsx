'use client';

import { GeneralModal } from '@/components/Elements/Modals/GeneralModal';
import { TeleopAction } from '@/components/PageComponents/OwnedRobots/Teleop/TeleopAction';
import { useGetControlledRobots } from '@/hooks/Control/control.hook';
import { useModalContext } from '@/hooks/Modals/context.hook';
import { FaGamepad, FaRobot } from 'react-icons/fa';

export const ControlBar = () => {
    const { openModal } = useModalContext();
    const { data: robots }: any = useGetControlledRobots();
    const controlledRobots = Object.values(robots || {})
        .filter((robot: any) => robot !== null && robot.ownedRobot !== null)
        .map((robot: any) => robot.ownedRobot);

    const handleTabClick = (robot: any) => {
        const modalId = `robot-control-${robot?.nickname}`;
        openModal(modalId, robot);
    };

    return (
        <>
            {controlledRobots.length > 0 && (
                <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
                    <div className="flex items-center gap-2 rounded-xl border border-slate-600/50 bg-slate-800/90 px-4 py-3 shadow-2xl backdrop-blur-sm">
                        <div className="flex items-center gap-2 text-slate-300">
                            <FaGamepad className="h-4 w-4" />
                            <span className="text-sm font-medium">Active Controls</span>
                        </div>
                        <div className="h-4 w-px bg-slate-600/50" />
                        <div className="scrollbar-hide flex max-w-96 items-center gap-2 overflow-x-auto">
                            {controlledRobots.map((robot: any, index: number) => {
                                const key = index;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => handleTabClick(robot)}
                                        className="group flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-slate-600/50 bg-slate-700/50 px-3 py-2 text-sm font-medium whitespace-nowrap text-slate-200 transition-all duration-200 hover:border-slate-500/50 hover:bg-slate-600/50 hover:text-white"
                                    >
                                        <FaRobot className="h-3 w-3 text-green-400" />
                                        <span>{robot?.nickname?.length > 24 ? `${robot?.nickname.slice(0, 24)}...` : robot?.nickname}</span>
                                        <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
            {controlledRobots.map((robot: any, index: number) => {
                return <ControlModal key={index} ownedRobot={robot} />;
            })}
        </>
    );
};

const ControlModal = ({ ownedRobot }: { ownedRobot: any }) => {
    const { useGetModal, closeModal } = useModalContext();

    const modelId = `robot-control-${ownedRobot?.nickname}`;
    const { data: modalState }: any = useGetModal(modelId);
    const handleCloseModal = (modelId: string) => {
        closeModal(modelId);
    };

    if (!modalState) return null;

    return (
        <>
            {modalState && (
                <GeneralModal isOpen={true} onClose={() => handleCloseModal(modelId)} title="Control" size="xl">
                    <TeleopAction ownedRobot={ownedRobot} onClose={() => handleCloseModal(modelId)} logs={false} />
                </GeneralModal>
            )}
        </>
    );
};
