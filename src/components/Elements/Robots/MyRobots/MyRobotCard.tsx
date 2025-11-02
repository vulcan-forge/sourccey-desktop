import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { FaRobot, FaEye, FaDatabase, FaBrain } from 'react-icons/fa';
import { HiChevronUp } from 'react-icons/hi';
import { useGetControlledRobot } from '@/hooks/Control/control.hook';
import clsx from 'clsx';
import { useGetAIModelCount } from '@/hooks/Components/AI/AIModels/ai-model.hook';
import { useGetDatasetCount } from '@/hooks/Components/AI/Dataset/dataset.hook';

export const MyRobotCard = ({ ownedRobot }: { ownedRobot: any }) => {
    const [showDetails, setShowDetails] = useState(false);

    const nickname = ownedRobot?.nickname || '';
    const { data: controlledRobot }: any = useGetControlledRobot(nickname);
    const isControlling = !!controlledRobot?.ownedRobot;

    const { data: dataCount } = useGetDatasetCount(nickname);
    const { data: modelsCount } = useGetAIModelCount(nickname);

    return (
        <Link
            href={`/app/owned-robots?id=${ownedRobot?.id}`}
            className="group hover:border-slate-625 hover:bg-slate-750 border-slate-675 bg-slate-775 cursor-pointer rounded-lg border-2 backdrop-blur-sm transition-all duration-300 hover:shadow-lg"
        >
            <div className="flex w-full flex-col gap-4 p-4">
                {/* Title Section with Image, Name, Nickname, and Status */}
                <div className="flex items-start gap-4">
                    {/* Robot Image */}
                    <div className="group-hover:bg-slate-675 h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-slate-700 transition-all duration-300 sm:h-16 sm:w-16 lg:h-20 lg:w-20">
                        {ownedRobot?.robot?.image ? (
                            <Image
                                src={ownedRobot?.robot?.image}
                                alt={ownedRobot?.robot?.name}
                                width={96}
                                height={96}
                                className="h-full w-full object-contain"
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-500/20 to-orange-600/20">
                                <FaRobot className="h-5 w-5 text-orange-500 sm:h-6 sm:w-6 lg:h-8 lg:w-8" />
                            </div>
                        )}
                    </div>

                    {/* Name, Nickname, and Status */}
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1">
                            <h3 className="truncate text-base font-bold text-white sm:text-lg lg:text-xl">{ownedRobot?.robot?.name}</h3>
                            {ownedRobot?.nickname && (
                                <p className="truncate text-sm font-medium text-slate-400 sm:text-base">{ownedRobot.nickname}</p>
                            )}
                        </div>
                    </div>

                    {/* Status Indicator - Top Right */}
                    <div className="flex flex-shrink-0 items-center space-x-2">
                        {isControlling && (
                            <>
                                <div className={`h-2 w-2 rounded-full bg-green-400`}></div>
                                <span className={`text-xs text-green-400 sm:text-sm`}>{'Running'}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Content Section */}
                <div className="flex w-full flex-col gap-4">
                    {/* Stats Grid */}
                    <div className="flex w-full flex-col gap-2 lg:flex-row">
                        <div className="group-hover:bg-slate-675 flex w-full items-center gap-2 rounded-lg bg-slate-700 p-2 transition-all duration-300 sm:gap-3 sm:p-3">
                            <FaDatabase className="h-4 w-4 flex-shrink-0 text-blue-400 sm:h-5 sm:w-5" />
                            <div className="min-w-0">
                                <div className="text-xs text-slate-400">Datasets</div>
                                <div className="text-sm font-semibold text-white">{dataCount || 0}</div>
                            </div>
                        </div>
                        <div className="group-hover:bg-slate-675 flex w-full items-center gap-2 rounded-lg bg-slate-700 p-2 transition-all duration-300 sm:gap-3 sm:p-3">
                            <FaBrain className="h-4 w-4 flex-shrink-0 text-green-400 sm:h-5 sm:w-5" />
                            <div className="min-w-0">
                                <div className="text-xs text-slate-400">Models</div>
                                <div className="text-sm font-semibold text-white">{modelsCount || 0}</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex">
                        <div
                            className={clsx(
                                'relative flex-1 cursor-pointer rounded-lg bg-gradient-to-r from-red-400/50 via-orange-400/50 to-yellow-400/50 px-2 py-2 text-center text-xs font-medium text-white sm:px-3 sm:text-sm',
                                'overflow-hidden transition-all duration-300',
                                'before:absolute before:inset-0 before:bg-gradient-to-r before:from-red-500/50 before:via-orange-500/50 before:to-yellow-500/50 before:opacity-0 before:transition-opacity before:duration-300',
                                'hover:before:opacity-100'
                            )}
                        >
                            <span className="relative z-10">Manage Robot</span>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
};
