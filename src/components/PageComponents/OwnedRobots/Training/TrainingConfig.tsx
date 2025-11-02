import { useGetTrainingConfig, setTrainingConfig, defaultTrainingConfig } from '@/hooks/Components/OwnedRobots/config.hook';
import { FaBrain, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { useEffect, useState, useCallback } from 'react';

export const TrainingConfiguration = ({ repoDir }: { repoDir?: string | null }) => {
    const [showAdvanced, setShowAdvanced] = useState(false);
    const { data: config }: any = useGetTrainingConfig();
    const updateConfig = useCallback((updates: Partial<TrainingConfig>) => {
        const newConfig = { ...config, ...updates };
        setTrainingConfig(newConfig);
    }, [config]);

    useEffect(() => {
        if (repoDir && repoDir !== config?.repo_dir) {
            const defaultConfig = defaultTrainingConfig();
            const newConfig = {
                repo_dir: repoDir,
                dataset: config?.dataset ?? defaultConfig.dataset,
                model_name: config?.model_name ?? defaultConfig.model_name,
                policy_type: config?.policy_type ?? defaultConfig.policy_type,
                batch_size: config?.batch_size ?? defaultConfig.batch_size,
                steps: config?.steps ?? defaultConfig.steps,
                distributed_training: config?.distributed_training ?? defaultConfig.distributed_training,
                num_gpus: config?.num_gpus ?? defaultConfig.num_gpus,
            };
            updateConfig(newConfig);
        }
    }, [repoDir, config?.repo_dir, config?.batch_size, config?.dataset, config?.distributed_training, config?.model_name, config?.num_gpus, config?.policy_type, config?.steps, updateConfig]);

    return (
        <>
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-yellow-500/30">
                        <FaBrain className="h-5 w-5 text-yellow-500" />
                    </div>
                    <h2 className="text-xl font-semibold text-white">AI Model Training</h2>
                </div>
            </div>

            {/* Training Configuration */}
            <div className="mb-3">
                <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-4 gap-2">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-400">Model Name</label>
                            <input
                                type="text"
                                value={config?.model_name || 'act_model_1'}
                                onChange={(e) => updateConfig({ model_name: e.target.value })}
                                className="border-slate-625 bg-slate-725 w-full rounded border px-3 py-1.5 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                                placeholder="Enter model name"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-400">Policy Type</label>
                            <input
                                type="text"
                                value={config?.policy_type || 'act'}
                                onChange={(e) => updateConfig({ policy_type: e.target.value })}
                                className="border-slate-625 bg-slate-725 w-full rounded border px-3 py-1.5 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                                placeholder="Enter policy type"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-400">Batch Size</label>
                            <input
                                type="number"
                                value={config?.batch_size || 8}
                                onChange={(e) => updateConfig({ batch_size: parseInt(e.target.value) || 8 })}
                                className="border-slate-625 bg-slate-725 w-full rounded border px-3 py-1.5 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                                min="1"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-400">Steps</label>
                            <input
                                type="number"
                                value={config?.steps || 10000}
                                onChange={(e) => updateConfig({ steps: parseInt(e.target.value) || 10000 })}
                                className="border-slate-625 bg-slate-725 w-full rounded border px-3 py-1.5 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                                min="1"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-400">Repository Directory</label>
                            <input
                                type="text"
                                value={config?.repo_dir || 'local'}
                                onChange={(e) => updateConfig({ repo_dir: e.target.value })}
                                disabled={!!repoDir}
                                className={`w-full rounded border px-3 py-1.5 text-sm transition-all duration-200 focus:outline-none ${
                                    repoDir
                                        ? 'cursor-not-allowed border-slate-700 bg-slate-800 text-slate-500'
                                        : 'border-slate-625 bg-slate-725 text-white focus:ring-2 focus:ring-yellow-500'
                                }`}
                                placeholder="Enter repository directory"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-400">Dataset Name</label>
                            <input
                                type="text"
                                value={config?.dataset || 'dataset'}
                                onChange={(e) => updateConfig({ dataset: e.target.value })}
                                className="border-slate-625 bg-slate-725 w-full rounded border px-3 py-1.5 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                                placeholder="Enter dataset name"
                            />
                        </div>
                    </div>

                    {/* Advanced Options Toggle */}
                    <div className="mt-4 flex justify-end">
                        <button
                            type="button"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex cursor-pointer items-center gap-2 text-sm text-slate-400 transition-colors duration-200 hover:text-white"
                        >
                            <span>Advanced Options</span>
                            {showAdvanced ? <FaChevronDown className="h-3 w-3" /> : <FaChevronRight className="h-3 w-3" />}
                        </button>
                    </div>

                    {/* Advanced Options */}
                    {showAdvanced && (
                        <div className="mt-2 rounded-lg border border-slate-600 bg-slate-800/50 p-4">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-400">Number of GPUs</label>
                                    <input
                                        type="number"
                                        value={config?.num_gpus || 1}
                                        onChange={(e) => updateConfig({ num_gpus: parseInt(e.target.value) || 1 })}
                                        className={`w-full rounded border px-3 py-1.5 text-sm transition-all duration-200 focus:outline-none ${
                                            config?.distributed_training === 'disabled'
                                                ? 'cursor-not-allowed border-slate-700 bg-slate-800 text-slate-500'
                                                : 'border-slate-625 bg-slate-725 text-white focus:ring-2 focus:ring-yellow-500'
                                        }`}
                                        min="0"
                                        disabled={config?.distributed_training === 'disabled'}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-400">Distributed Training</label>
                                    <select
                                        value={config?.distributed_training}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            if (value === 'disabled') {
                                                updateConfig({ distributed_training: value, num_gpus: 1 });
                                            } else {
                                                updateConfig({ distributed_training: value });
                                            }
                                        }}
                                        className="border-slate-625 bg-slate-725 w-full rounded border px-3 py-1.5 text-sm text-white transition-all duration-200 focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                                    >
                                        <option value="disabled">Disabled</option>
                                        <option value="enabled">Enabled</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export interface TrainingConfig {
    repo_dir: string;
    dataset: string;
    policy_type: string;
    model_name: string;
    batch_size: number;
    steps: number;
    distributed_training: string;
    num_gpus: number;
}

export interface StartTrainingConfig {
    repo_dir: string;
    dataset: string;
    policy_type: string;
    model_name: string;
    batch_size: number;
    steps: number;
    distributed_training: boolean;
    num_gpus: number;
}
