'use client';

import { useGetAllAIModels } from '@/hooks/Components/AI/AIModels/ai-model.hook';
import { estimateModelParameters, formatParameterCount } from '@/utils/ai/parameters';
import Link from 'next/link';
import { useMemo } from 'react';
import { FaArrowRight, FaBrain, FaDatabase, FaBolt, FaSpinner, FaCircle, FaPlus } from 'react-icons/fa';

export const TrainAI = () => {
    const pageSize = 3;
    const { data, isLoading }: any = useGetAllAIModels(pageSize);

    let allModels = useMemo(() => {
        return data?.pages.flatMap((page: any) => page.data) || [];
    }, [data?.pages]);

    return (
        <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">Train AI</h3>
                <Link
                    href="/app/training"
                    className="inline-flex items-center space-x-2 rounded-lg bg-gradient-to-r from-yellow-500 to-yellow-600 px-3 py-2 text-sm font-medium text-white transition-all duration-300 hover:from-yellow-600 hover:to-yellow-700 hover:shadow-lg hover:shadow-yellow-500/20"
                >
                    <span>Train New Model</span>
                    <FaArrowRight className="h-3 w-3" />
                </Link>
            </div>
            {isLoading && (
                <div className="flex h-[310px] items-center justify-center rounded-xl border-2 border-slate-700 bg-slate-800 p-4 backdrop-blur-sm">
                    <div className="flex items-center justify-center py-8">
                        <FaSpinner className="h-8 w-8 animate-spin text-yellow-500" />
                    </div>
                </div>
            )}
            {!isLoading && (!allModels || allModels.length === 0) ? (
                <div className="flex h-48 flex-col items-center justify-center py-8 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 p-2">
                        <FaBrain className="h-8 w-8 text-yellow-500" />
                    </div>
                    <h3 className="mb-2 text-lg font-medium text-slate-300">No AI models yet</h3>
                    <p className="mb-4 text-sm text-slate-400">Start training your first AI model to get started</p>
                    <Link
                        href="/app/training"
                        className="inline-flex items-center space-x-2 rounded-lg bg-gradient-to-r from-yellow-500 to-yellow-600 px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:from-yellow-600 hover:to-yellow-700 hover:shadow-lg hover:shadow-yellow-500/20"
                    >
                        <FaPlus className="h-3 w-3" />
                        <span>Train Model</span>
                    </Link>
                </div>
            ) : (
                <div className="space-y-3">
                    {allModels?.slice(0, 3).map((model: any, index: number) => {
                        return <TrainAIHomeCard key={index} model={model} />;
                    })}
                </div>
            )}
        </div>
    );
};

export const TrainAIHomeCard = ({ model }: { model: any }) => {
    const modelName = model?.name || '';
    const truncatedName = modelName.length > 8 ? `${modelName.slice(0, 8)}...` : modelName;
    const policyType = model?.training_config?.policy?.type || 'Unknown';
    const parameters = formatParameterCount(estimateModelParameters(model?.training_config));
    const episodes = model?.episodes || 0;
    const steps = formatParameterCount(model?.training_config?.steps || 0);

    return (
        <Link
            href={`/app/ai-models?repo_id=${model?.repo_id}&name=${modelName}`}
            className="hover:bg-slate-725 flex cursor-pointer items-center space-x-4 rounded-lg bg-slate-700 p-4 transition-all duration-200"
        >
            <div className="flex items-center space-x-4">
                <div className="h-12 w-12 overflow-hidden rounded-lg bg-slate-700">
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-yellow-500/20 to-yellow-600/20">
                        <FaBrain className="h-6 w-6 text-yellow-500" />
                    </div>
                </div>
                <div className="flex-1">
                    <div className="font-medium text-white">{truncatedName}</div>
                    <div className="text-xs text-slate-400">{policyType}</div>
                </div>
            </div>
            <div className="grow"></div>
            <div className="flex items-center space-x-4">
                <div className="flex flex-col items-center gap-1">
                    <FaBolt className="h-4 w-4 text-yellow-500" />
                    <div className="text-xs text-slate-400">{parameters} Params</div>
                </div>

                <div className="flex flex-col items-center gap-1">
                    <FaDatabase className="h-4 w-4 text-yellow-500" />
                    <div className="text-xs text-slate-400">{episodes} Ep.</div>
                </div>

                <div className="flex flex-col items-center gap-1">
                    <FaCircle className="h-4 w-4 text-yellow-500" />
                    <div className="text-xs text-slate-400">{steps} Steps</div>
                </div>
            </div>
        </Link>
    );
};
