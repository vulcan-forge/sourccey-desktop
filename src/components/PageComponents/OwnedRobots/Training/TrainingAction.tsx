import React, { useState } from 'react';
import { FaExclamationTriangle, FaPlay, FaSpinner } from 'react-icons/fa';
import { useGetTrainingConfig } from '@/hooks/Components/OwnedRobots/config.hook';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { invoke } from '@tauri-apps/api/core';
import { TrainingConfiguration, type StartTrainingConfig } from '@/components/PageComponents/OwnedRobots/Training/TrainingConfig';
import {
    addModelLogListener,
    removeModelLogListener,
    addModelShutdownListener,
    removeModelShutdownListener,
} from '@/utils/logs/training-logs/training-logs';
import { useGetTrainingExists } from '@/hooks/AI/training.hook';
import { Tooltip } from 'react-tooltip';
import { Spinner } from '@/components/Elements/Spinner';

export const TrainingAction = ({ repoDir }: { repoDir?: string | null }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isTrainingLogsLoading, setIsTrainingLogsLoading] = useState({});

    const { data: trainingConfig }: any = useGetTrainingConfig();
    const { data: trainingExists, isLoading: isLoadingTrainingExists }: any = useGetTrainingExists(trainingConfig);

    const isTrainingLoading = isLoading || isLoadingTrainingExists;
    const isTrainingDisabled = isLoading || isLoadingTrainingExists || trainingExists;

    // Function to start listening for a specific model's logs
    const startModelTraining = async (modelName: string) => {
        try {
            await addModelLogListener(modelName);
            await addModelShutdownListener(modelName);
        } catch (error) {
            console.error(`Failed to start listening for model ${modelName}:`, error);
        }
    };

    // Function to stop listening for a specific model's logs
    const stopModelTraining = (modelName: string) => {
        try {
            removeModelLogListener(modelName);
            removeModelShutdownListener(modelName);
        } catch (error) {
            console.error(`Failed to stop listening for model ${modelName}:`, error);
        }
    };

    const handleStartTraining = async () => {
        try {
            setIsLoading(true);
            setError(null);

            const useDistributedTraining = trainingConfig.distributed_training === 'enabled';
            const startTrainingConfig: StartTrainingConfig = {
                repo_dir: trainingConfig.repo_dir,
                dataset: trainingConfig.dataset,
                policy_type: trainingConfig.policy_type,
                model_name: trainingConfig.model_name,
                batch_size: trainingConfig.batch_size,
                steps: trainingConfig.steps,
                distributed_training: useDistributedTraining,
                num_gpus: trainingConfig.num_gpus,
            };

            await startModelTraining(trainingConfig.model_name);
            const result = await invoke('start_training', { config: startTrainingConfig });
            toast.success(`Training started: ${result}`, {
                ...toastSuccessDefaults,
            });
        } catch (err) {
            await stopModelTraining(trainingConfig.model_name);
            toast.error(`Failed to start training: ${err instanceof Error ? err.message : 'Unknown error occurred'}`, {
                ...toastErrorDefaults,
            });
            setError(err instanceof Error ? err.message : 'Failed to start training');
        } finally {
            setIsLoading(false);
        }
    };

    // Get the first model from the isTrainingLogsLoading object
    const loadingTrainigLogs = Object.keys(isTrainingLogsLoading)?.[0];

    // Loading Trainig logs and compare

    return (
        <div className={`rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm`}>
            <TrainingConfiguration repoDir={repoDir} />
            <div className="flex flex-col gap-6 sm:flex-row">
                <div>
                    <button
                        onClick={handleStartTraining}
                        disabled={isTrainingDisabled}
                        data-tooltip-id="training-button-tooltip"
                        className={`inline-flex h-10 w-36 items-center justify-center gap-2 rounded px-3 text-sm font-bold transition-all ${
                            isTrainingDisabled
                                ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                                : 'cursor-pointer bg-yellow-500 text-white hover:bg-yellow-400'
                        }`}
                    >
                        {isTrainingLoading ? <FaSpinner className="h-3 w-3 animate-spin" /> : <FaPlay className="h-3 w-3" />}
                        {isTrainingLoading ? 'Starting...' : 'Start Training'}
                    </button>

                    {/* Tooltip for disabled training button */}
                    <Tooltip
                        id="training-button-tooltip"
                        place="top"
                        className="custom-tooltip !z-[1000] !max-w-xs !rounded-lg !border-2 !border-slate-600 !bg-slate-700 !px-3 !py-2 !text-sm !break-words !whitespace-pre-wrap !text-slate-100"
                        border="2px solid #475569"
                        arrowColor="#334155"
                        classNameArrow="!shadow-none"
                    >
                        {isTrainingDisabled && (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <FaExclamationTriangle className="h-4 w-4 text-yellow-500" />
                                    <span className="font-semibold">Model Already Exists</span>
                                </div>
                                <div className="flex flex-col gap-2 text-sm">
                                    <div>Model Name for this Repository Directory already exists.</div>
                                    <div>
                                        Please change the model name to start training (resuming model training will be available in the
                                        future).
                                    </div>
                                </div>
                            </div>
                        )}
                    </Tooltip>
                </div>
                <div className="flex items-center justify-center gap-2">
                    {loadingTrainigLogs && (
                        <>
                            <div>
                                <Spinner />
                            </div>
                            <div className="text-sm text-slate-400">{`Training logs for ${loadingTrainigLogs} are loading...`}</div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
