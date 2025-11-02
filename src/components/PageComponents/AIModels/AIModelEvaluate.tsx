import { FaRobot, FaArrowRight } from 'react-icons/fa';
import type { AIModel } from '@/types/Module/AIModels/ai-model';
import Link from 'next/link';
import { setContent } from '@/hooks/Components/OwnedRobots/owned-robots.hook';
import { useGetOwnedRobotByNickname } from '@/hooks/Models/OwnedRobot/owned-robot.hook';

interface AIModelEvaluateProps {
    model: AIModel;
    isLoading: boolean;
}

export const AIModelEvaluate = ({ model, isLoading }: AIModelEvaluateProps) => {
    const nickname = model.repo_id;
    const { data: ownedRobot }: any = useGetOwnedRobotByNickname(nickname);

    const id = ownedRobot?.id;
    const isModelCompatible = ownedRobot?.robot?.robot_type === model.robot_type;
    return (
        <div className="mb-4 flex w-full flex-col rounded-xl border border-slate-600/50 bg-slate-800/50 p-8 shadow-lg">
            <div className="mb-6 flex items-center gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 shadow-lg">
                    <FaRobot className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">Evaluate Model</h3>
                    <p className="text-sm text-slate-400">Test performance with your physical robot</p>
                </div>
            </div>

            <div className="mb-6 rounded-lg border border-slate-600/30 bg-slate-700/30 p-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-300">Repository</span>
                        <span className="font-mono text-sm text-slate-200">{model.repo_id}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-300">Model Name</span>
                        <span className="text-sm text-slate-200">{model.name}</span>
                    </div>
                </div>
            </div>

            {ownedRobot && (
                <div className="flex justify-end">
                    <Link
                        onClick={async () => {
                            setContent('evaluate');
                        }}
                        href={`/app/owned-robots?id=${id}`}
                        className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-6 py-2.5 font-medium text-white transition-all duration-200 hover:bg-blue-600 disabled:opacity-50"
                    >
                        <FaRobot className="h-4 w-4" />
                        Go to Robot Evaluation
                        <FaArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            )}
            {!ownedRobot && (
                <div className="flex justify-end">
                    <p className="text-sm text-slate-400">No owned robot found that matches the model</p>
                </div>
            )}
        </div>
    );
};
