import { useState } from 'react';
import { FaEye, FaRobot } from 'react-icons/fa';
import { HiChevronUp } from 'react-icons/hi';

import Image from 'next/image';
import type { Robot } from '@/types/Models/robot';
import { useModalContext } from '@/hooks/Modals/context.hook';

export const RobotCard = ({ robot }: { robot: Robot }) => {
    const [showDetails, setShowDetails] = useState(false);
    const { openModal } = useModalContext();

    const handleAddToMyRobots = () => {
        openModal('addMyRobot', robot);
    };

    const image = robot.image ? robot.image : null;
    return (
        <div>
            <div
                key={robot.id}
                className="rounded-xl border-2 border-slate-700/50 bg-slate-800/50 backdrop-blur-sm transition-all duration-300 hover:border-slate-600/50 hover:shadow-lg"
            >
                {/* Robot Header */}
                <div className="flex flex-col gap-4 p-6">
                    <div className="flex items-start space-x-4">
                        <div className="h-16 w-16 overflow-hidden rounded-lg bg-slate-700">
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-500/20 to-orange-600/20">
                                {image ? (
                                    <Image src={image} alt={robot.name ?? 'Robot'} width={64} height={64} />
                                ) : (
                                    <FaRobot className="h-8 w-8 text-orange-500" />
                                )}
                            </div>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-white">{robot.name}</h3>
                            <p className="mt-1 h-10 overflow-hidden text-sm text-slate-300">{robot.short_description}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleAddToMyRobots}
                            className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:from-orange-600 hover:to-orange-700"
                        >
                            Add to My Robots
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowDetails(!showDetails)}
                            className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-slate-700/50 px-3 py-2 text-sm font-medium text-slate-300 transition-colors duration-200 hover:bg-slate-600/50 hover:text-white"
                        >
                            {showDetails ? (
                                <>
                                    <HiChevronUp className="mr-1 h-4 w-4" />
                                    <div>Hide Details</div>
                                </>
                            ) : (
                                <>
                                    <FaEye className="mr-1 h-4 w-4" />
                                    <div>More Details</div>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Expanded Content */}
                {showDetails && (
                    <div className="border-t border-slate-700/50 bg-slate-700/30 p-6">
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-semibold text-white">Description</h4>
                                <p className="mt-1 text-sm text-slate-300">{robot.description}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
