import React from 'react';
import { FaBrain, FaBolt, FaEye, FaDatabase, FaSpinner } from 'react-icons/fa';
import { estimateModelParameters, formatParameterCount } from '@/utils/ai/parameters';
import type { AIModel } from '@/types/Module/AIModels/ai-model';
import Link from 'next/link';

interface AIModelOverviewProps {
    model: AIModel | null;
    isLoading: boolean;
}

export const AIModelOverview: React.FC<AIModelOverviewProps> = ({ model, isLoading }) => {
    if (isLoading) {
        return (
            <div className="flex h-[310px] items-center justify-center rounded-xl border-2 border-slate-700 bg-slate-800 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-center py-8">
                    <FaSpinner className="h-8 w-8 animate-spin text-blue-500" />
                </div>
            </div>
        );
    }

    if (!model) {
        return (
            <div className="flex h-[310px] items-center justify-center rounded-xl border-2 border-slate-700 bg-slate-800 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                        <FaBrain className="mx-auto mb-3 h-8 w-8 text-slate-600" />
                        <h3 className="text-lg font-medium text-slate-300">No model selected</h3>
                        <p className="text-sm text-slate-400">Select a model from the list below to view details</p>
                    </div>
                </div>
            </div>
        );
    }

    // Calculate estimated parameters
    const estimatedParams = model.training_config ? estimateModelParameters(model.training_config) : 0;
    const formattedParams = formatParameterCount(estimatedParams);

    const modelName = model?.name;
    const datasetFile = model?.training_config?.dataset?.repo_id;
    const policyType = model?.training_config?.policy?.type;
    const episodes = model?.episodes || 0;
    const steps = model?.training_config?.steps || 0;
    const batchSize = model?.training_config?.batch_size || 0;
    const samples = steps * batchSize;
    const repo_id = model?.repo_id;

    const modelURL = `/app/ai-models?repo_id=${repo_id}&name=${modelName}`;
    return (
        <div className="flex h-[310px] flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b-2 border-slate-700 pb-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-500/20">
                        <FaBrain className="h-5 w-5 text-green-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Selected Model</h2>
                    </div>
                </div>
                <div className="grow"></div>
                <div className="flex items-center gap-2">
                    <Link
                        href={modelURL}
                        className="flex cursor-pointer items-center gap-2 rounded-lg bg-green-500/20 px-4 py-2.5 font-medium text-green-400 transition-all duration-200 hover:bg-green-500/30 hover:text-green-300 hover:shadow-md"
                    >
                        <FaEye className="text-sm" /> View Model
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg bg-slate-700 p-4">
                    <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-green-500/20">
                            <FaBrain className="h-4 w-4 text-green-400" />
                        </div>
                        <span className="text-sm font-medium text-slate-400">Model</span>
                    </div>
                    <div className="truncate text-sm text-slate-300">{modelName || 'Unknown Model'}</div>
                </div>

                <div className="rounded-lg bg-slate-700 p-4">
                    <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                            <FaDatabase className="h-4 w-4 text-blue-400" />
                        </div>
                        <span className="text-sm font-medium text-slate-400">Dataset</span>
                    </div>
                    <div className="truncate text-sm text-slate-300">{datasetFile || 'Unknown Dataset'}</div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div className="rounded-lg bg-slate-700 p-4">
                    <div className="mb-1 flex items-center gap-2">
                        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-yellow-500/20">
                            <FaBolt className="h-3 w-3 text-yellow-500" />
                        </div>
                        <span className="text-xs font-medium text-slate-400">Parameters</span>
                    </div>
                    <div className="text-lg font-bold text-slate-200">{formattedParams}</div>
                </div>
                <div className="rounded-lg bg-slate-700 p-4">
                    <div className="mb-1 text-xs font-medium text-slate-400">Episodes</div>
                    <div className="text-lg font-bold text-slate-200">{episodes.toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-slate-700 p-4">
                    <div className="mb-1 text-xs font-medium text-slate-400">Steps</div>
                    <div className="text-lg font-bold text-slate-200">{steps.toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-slate-700 p-4">
                    <div className="mb-1 text-xs font-medium text-slate-400">Samples</div>
                    <div className="text-lg font-bold text-slate-200">{samples.toLocaleString()}</div>
                </div>
            </div>
        </div>
    );
};
