import Link from 'next/link';
import { FaDatabase, FaBrain } from 'react-icons/fa';
import { useGetAIModelCount } from '@/hooks/Components/AI/AIModels/ai-model.hook';
import { useGetDatasetCount } from '@/hooks/Components/AI/Dataset/dataset.hook';

export const MyRobotCard = ({ ownedRobot }: { ownedRobot: any }) => {
    const nickname = ownedRobot?.nickname || '';
    const { data: dataCount } = useGetDatasetCount(nickname);
    const { data: modelsCount } = useGetAIModelCount(nickname);

    return (
        <Link
            href={`/app/owned-robots?id=${ownedRobot?.id}`}
            className="group flex w-full flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800/70 p-4 backdrop-blur-sm transition-colors duration-200 hover:border-slate-600 hover:bg-slate-775"
        >
            <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-white sm:text-lg">{ownedRobot?.robot?.name}</h3>
                {ownedRobot?.nickname && <p className="truncate text-xs text-slate-400">@{ownedRobot.nickname}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-700/70 px-2 py-1 text-slate-200">
                    <FaDatabase className="h-3.5 w-3.5 text-blue-400" />
                    {dataCount || 0} Datasets
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-700/70 px-2 py-1 text-slate-200">
                    <FaBrain className="h-3.5 w-3.5 text-emerald-400" />
                    {modelsCount || 0} Models
                </span>
            </div>

            <div className="mt-1 inline-flex w-full items-center justify-center rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm font-semibold text-orange-200 transition-colors duration-200 group-hover:bg-orange-500/20">
                Manage Robot
            </div>
        </Link>
    );
};
