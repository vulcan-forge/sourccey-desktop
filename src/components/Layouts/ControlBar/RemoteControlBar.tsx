'use client';

import { RemoteRobotStatus, useGetRemoteRobotsState } from '@/hooks/Control/remote-control.hook';
import { FaGamepad, FaRobot } from 'react-icons/fa';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export const RemoteControlBar = () => {
    const router = useRouter();
    const { data: robots }: any = useGetRemoteRobotsState();

    const remoteRobots = Object.values(robots || {})
        .filter((robot: any) => robot !== null && robot.status !== RemoteRobotStatus.NONE)
        .map((robot: any) => robot);

    return (
        <>
            {remoteRobots.length > 0 && (
                <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
                    <div className="flex items-center gap-2 rounded-xl border border-slate-600/50 bg-slate-800/90 px-4 py-3 shadow-2xl backdrop-blur-sm">
                        <div className="flex items-center gap-2 text-slate-300">
                            <FaGamepad className="h-4 w-4" />
                            <span className="text-sm font-medium">Remote Controls</span>
                        </div>
                        <div className="h-4 w-px bg-slate-600/50" />
                        <div className="scrollbar-hide flex max-w-96 items-center gap-2 overflow-x-auto">
                            {remoteRobots.map((robot: any, index: number) => {
                                const key = index;
                                const controlledRobot = robot?.controlledRobot;
                                const nickname = controlledRobot?.nickname;
                                const robotId = controlledRobot?.id;
                                const label = nickname > 24 ? `${nickname.slice(0, 24)}...` : nickname;
                                return (
                                    <button
                                        type="button"
                                        key={key}
                                        onClick={() => {
                                            router.push(robotId ? `/desktop/robot?id=${robotId}` : '/desktop/robot');
                                        }}
                                        className="group flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-slate-600/50 bg-slate-700/50 px-3 py-2 text-sm font-medium whitespace-nowrap text-slate-200 transition-all duration-200 hover:border-slate-500/50 hover:bg-slate-600/50 hover:text-white"
                                    >
                                        <FaRobot className="h-3 w-3 text-green-400" />
                                        <span>{label || 'Robot'}</span>
                                        <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
