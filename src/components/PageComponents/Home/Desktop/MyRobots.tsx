import { useGetAIModelCount } from '@/hooks/Components/AI/AIModels/ai-model.hook';
import { useGetControlledRobot } from '@/hooks/Control/control.hook';
import { useGetOwnedRobots } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import Link from 'next/link';
import { FaArrowRight, FaRobot, FaBrain, FaPlus } from 'react-icons/fa';

export const MyRobots = () => {
    const { data: ownedRobots, isLoading: isLoadingOwnedRobots }: any = useGetOwnedRobots(true);

    return (
        <div className="flex w-full flex-col rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">My Robots</h3>
                <Link
                    href="/app/robots"
                    className="inline-flex items-center space-x-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-3 py-2 text-sm font-medium text-white transition-all duration-300 hover:from-orange-600 hover:to-orange-700 hover:shadow-lg hover:shadow-orange-500/20"
                >
                    <span>View All</span>
                    <FaArrowRight className="h-3 w-3" />
                </Link>
            </div>

            {!isLoadingOwnedRobots && (!ownedRobots || ownedRobots.length === 0) ? (
                <div className="flex h-48 flex-col items-center justify-center py-8 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-orange-500/20 to-orange-600/20 p-2">
                        <FaRobot className="h-8 w-8 text-orange-500" />
                    </div>
                    <h3 className="mb-2 text-lg font-medium text-slate-300">No robots yet</h3>
                    <p className="mb-4 text-sm text-slate-400">Start your robotics journey by adding your first robot</p>
                    <Link
                        href="/app/robots"
                        className="inline-flex items-center space-x-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:from-orange-600 hover:to-orange-700 hover:shadow-lg hover:shadow-orange-500/20"
                    >
                        <FaPlus className="h-3 w-3" />
                        <span>View Robots</span>
                    </Link>
                </div>
            ) : (
                <div className="space-y-3">
                    {ownedRobots?.map((ownedRobot: any) => {
                        const id = ownedRobot.id;
                        return <MyRobotHomeCard key={id} ownedRobot={ownedRobot} />;
                    })}
                </div>
            )}
        </div>
    );
};

export const MyRobotHomeCard = ({ ownedRobot }: { ownedRobot: any }) => {
    const robotName = ownedRobot.robot.name;
    const nickname = ownedRobot?.nickname || '';
    const { data: controlledRobot }: any = useGetControlledRobot(nickname);
    const isControlling = !!controlledRobot?.ownedRobot;

    const { data: modelsCount } = useGetAIModelCount(nickname);
    return (
        <Link
            href={`/app/owned-robots?id=${ownedRobot?.id}`}
            className="hover:bg-slate-725 flex cursor-pointer items-center space-x-4 rounded-lg bg-slate-700 p-4 transition-all duration-200"
        >
            <div className="flex items-center space-x-4">
                <div className="h-12 w-12 overflow-hidden rounded-lg bg-slate-700">
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-500/20 to-orange-600/20">
                        <FaRobot className="h-6 w-6 text-orange-500" />
                    </div>
                </div>
                <div className="flex-1">
                    <div className="font-medium text-white">{robotName}</div>
                    {nickname && <div className="text-xs text-slate-400">@{nickname}</div>}
                </div>
            </div>
            <div className="grow"></div>
            <div className="flex items-center space-x-4">
                <div className="flex flex-col items-center gap-1">
                    <FaBrain className="h-4 w-4 text-orange-500" />
                    <div className="text-sm text-slate-400">
                        {modelsCount || 0} {modelsCount === 1 ? 'Model' : 'Models'}
                    </div>
                </div>

                <div className="text-right">
                    {isControlling && (
                        <div className="flex items-center space-x-1 text-sm text-green-400">
                            <div className="h-2 w-2 rounded-full bg-green-400"></div>
                            <span>Running</span>
                        </div>
                    )}
                </div>
            </div>
        </Link>
    );
};
