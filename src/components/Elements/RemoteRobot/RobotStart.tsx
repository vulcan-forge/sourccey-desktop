'use client';

import { FaPlay, FaStop } from 'react-icons/fa';
import { RobotKioskLogs } from '@/components/PageComponents/Robots/RobotLogs/RobotKioskLogs';

type RobotStartSectionProps = {
    nickname?: string;
    isRobotStarted: boolean;
    isStarting: boolean;
    isStopping: boolean;
    onStartAction: () => void;
    onStopAction: () => void;
};

export const RobotStartSection = ({ nickname, isRobotStarted, isStarting, isStopping, onStartAction, onStopAction }: RobotStartSectionProps) => {
    return (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800/60 p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">Robot Control</h3>
                    <p className="mt-1 text-sm text-slate-300">Start or stop the robot host process. Logs will stream below.</p>
                </div>
                <div className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                    {isRobotStarted ? 'Running' : 'Stopped'}
                </div>
            </div>

            <div>
                <button
                    onClick={isRobotStarted ? onStopAction : onStartAction}
                    disabled={isStarting || isStopping}
                    className={`inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl px-12 py-3 text-xl font-semibold transition-all ${
                        isStarting || isStopping
                            ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                            : isRobotStarted
                              ? 'cursor-pointer bg-red-500 text-white hover:bg-red-600 active:bg-red-700'
                              : 'cursor-pointer bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
                    }`}
                >
                    {isStarting || isStopping ? (
                        <>
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            {isStarting && 'Starting...'}
                            {isStopping && 'Stopping...'}
                        </>
                    ) : isRobotStarted ? (
                        <>
                            <FaStop className="h-5 w-5" /> Stop Robot
                        </>
                    ) : (
                        <>
                            <FaPlay className="h-5 w-5" /> Start Robot
                        </>
                    )}
                </button>
            </div>

            <RobotKioskLogs isControlling={isRobotStarted || isStarting || isStopping} nickname={nickname} />
        </div>
    );
};
