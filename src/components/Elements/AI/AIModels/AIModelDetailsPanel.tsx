import React from 'react';
import { FaEye, FaDownload, FaTrash, FaBrain, FaCog, FaFolder, FaBolt } from 'react-icons/fa';
import { estimateModelParameters, formatParameterCount } from '@/utils/ai/parameters';
import type { AIModel } from '@/types/Module/AIModels/ai-model';
import Link from 'next/link';
import { setAIModelBackButton } from '@/hooks/Components/Back/back-button.hook';

interface AIModelDetailsPanelProps {
    model: AIModel | null;
}

export const AIModelDetailsPanel: React.FC<AIModelDetailsPanelProps> = ({ model }) => {
    if (!model) return null;

    // Calculate estimated parameters
    const estimatedParams = model.training_config ? estimateModelParameters(model.training_config) : 0;
    const formattedParams = formatParameterCount(estimatedParams);

    const datasetFile = model?.training_config?.dataset?.repo_id;
    const policyType = model?.training_config?.policy?.type;
    const episodes = model?.episodes || 0;
    const steps = model?.training_config?.steps || 0;
    const batchSize = model?.training_config?.batch_size || 0;
    const samples = steps * batchSize;
    const learningRate = model?.training_config?.optimizer?.lr;
    const optimizer = model?.training_config?.optimizer?.type;

    const currentURL = window?.location?.pathname;
    const modelURL = `/app/ai-models?repo_id=${model.repo_id}&name=${model.name}`;
    return (
        <div className="mb-4 flex w-full flex-col rounded-xl border border-slate-600/50 bg-slate-800/50 p-8 shadow-lg">
            <div className="relative mb-8 border-b border-slate-600/50 pb-6">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 shadow-lg">
                            <FaBrain className="h-6 w-6 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="mb-2 text-xl font-bold text-white">{model.name}</h3>
                            <p className="text-sm text-slate-400">Path: {model.path || 'N/A'}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                {/* Model Info Section */}
                <div className="rounded-lg border border-slate-600/30 bg-slate-700/30 p-6">
                    <h4 className="mb-4 border-b border-slate-600/50 pb-2 text-lg font-semibold text-white">Model Information</h4>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Policy Type</span>
                            <span className="font-medium text-slate-200">{policyType || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Parameters</span>
                            <span className="font-medium text-slate-200">{formattedParams}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Optimizer</span>
                            <span className="font-medium text-slate-200">{optimizer || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Learning Rate</span>
                            <span className="font-medium text-slate-200">{learningRate || 'Unknown'}</span>
                        </div>
                    </div>
                </div>

                {/* Training Stats Section */}
                <div className="rounded-lg border border-slate-600/30 bg-slate-700/30 p-6">
                    <h4 className="mb-4 border-b border-slate-600/50 pb-2 text-lg font-semibold text-white">Training Statistics</h4>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Episodes</span>
                            <span className="font-medium text-slate-200">{episodes.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Steps</span>
                            <span className="font-medium text-slate-200">{steps.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Batch Size</span>
                            <span className="font-medium text-slate-200">{batchSize.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Total Samples</span>
                            <span className="font-medium text-slate-200">{samples.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Dataset Section */}
                <div className="rounded-lg border border-slate-600/30 bg-slate-700/30 p-6">
                    <h4 className="mb-4 border-b border-slate-600/50 pb-2 text-lg font-semibold text-white">Training Dataset</h4>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-600/50">
                                <FaFolder className="h-5 w-5 text-slate-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="font-medium text-slate-200">{datasetFile || 'Unknown'}</div>
                            </div>
                        </div>

                        {model.training_config?.dataset?.revision && (
                            <div className="flex items-center justify-between border-t border-slate-600/30 pt-2">
                                <span className="text-sm text-slate-300">Revision</span>
                                <span className="text-sm font-medium text-slate-200">{model.training_config.dataset.revision}</span>
                            </div>
                        )}

                        <div className="flex items-center justify-between border-t border-slate-600/30 pt-2">
                            <span className="text-sm text-slate-300">Image Transforms</span>
                            <span className="text-sm font-medium text-slate-200">
                                {model.training_config?.dataset?.image_transforms?.enable ? 'Enabled' : 'Disabled'}
                            </span>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-600/30 pt-2">
                            <span className="text-sm text-slate-300">Video Backend</span>
                            <span className="text-sm font-medium text-slate-200">
                                {model.training_config?.dataset?.video_backend || 'Default'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Configuration Details */}
            {model.training_config && (
                <div className="mt-8 rounded-lg border border-slate-600/30 bg-slate-700/30 p-6">
                    <h4 className="mb-4 border-b border-slate-600/50 pb-2 text-lg font-semibold text-white">Training Configuration</h4>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Seed</span>
                            <span className="font-medium text-slate-200">{model.training_config.seed}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Num Workers</span>
                            <span className="font-medium text-slate-200">{model.training_config.num_workers}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Eval Frequency</span>
                            <span className="font-medium text-slate-200">{model.training_config.eval_freq}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Log Frequency</span>
                            <span className="font-medium text-slate-200">{model.training_config.log_freq}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Save Frequency</span>
                            <span className="font-medium text-slate-200">{model.training_config.save_freq}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Num GPUs</span>
                            <span className="font-medium text-slate-200">{model.training_config.num_gpus}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-slate-600/50 pt-6">
                <button className="flex cursor-pointer items-center gap-2 rounded-lg bg-red-500/40 px-4 py-2.5 font-medium text-red-200 transition-all duration-200 hover:bg-red-500/60 hover:text-red-300 hover:shadow-md">
                    <FaTrash className="text-sm" /> Delete
                </button>
            </div>
        </div>
    );
};
