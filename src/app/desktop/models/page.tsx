'use client';

import {
    deleteHuggingFaceModelFromCache,
    getHuggingFaceOrganizationModels,
    type HuggingFaceDownloadProgressEvent,
    type HuggingFaceModelDownloadCompletionEvent,
    startHuggingFaceModelDownload,
} from '@/api/Local/AI/ai_models';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { setSelectedModel, useSelectedModel } from '@/hooks/Model/selected-model.hook';
import { usePairedRobotConnections } from '@/hooks/Robot/paired-robot-connection.hook';
import { useRobotConnectionStatuses } from '@/hooks/Robot/robot-connection-status.hook';
import { useSelectedRobot } from '@/hooks/Robot/selected-robot.hook';
import type { HuggingFaceModelCard } from '@/types/Module/AIModels/ai-model';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';

const MODEL_CARD_IMAGE = '/assets/logo/SourcceyLogo.png';
const DEFAULT_EVALUATE_TASK = 'Fold the large towel in half';
const DEFAULT_HUGGINGFACE_ORGANIZATION = 'Mechanichris';
const MAX_ERROR_TOAST_CHARS = 1200;

type ModelCard = {
    id: string;
    repoId: string; // owner/model
    name: string;
    image: string;
    description: string | null;
    sizeBytes: number | null;
    downloads: number | null;
    likes: number | null;
    lastModified: string | null;
    downloaded: boolean;
    snapshotPath: string | null;
    highestCheckpointStep: number | null;
    pretrainedModelPath: string | null;
    hasEnoughSpace: boolean | null;
};

const getErrorMessage = (error: unknown) => {
    const sanitizeMessage = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return 'Unexpected error occurred.';
        if (trimmed.length <= MAX_ERROR_TOAST_CHARS) return trimmed;
        return `${trimmed.slice(0, MAX_ERROR_TOAST_CHARS)}...`;
    };

    if (typeof error === 'string') return sanitizeMessage(error);
    if (error && typeof error === 'object') {
        const maybeMessage = (error as { message?: string }).message;
        if (typeof maybeMessage === 'string') return sanitizeMessage(maybeMessage);
    }
    return sanitizeMessage('Unexpected error occurred.');
};

const formatBytes = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return 'Unknown';
    if (value <= 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    const fixed = size >= 100 ? 0 : size >= 10 ? 1 : 2;
    return `${size.toFixed(fixed)} ${units[unitIndex]}`;
};

const formatCompactNumber = (value: number | null) => {
    if (value === null) return 'Unknown';
    return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
};

const formatDate = (value: string | null) => {
    if (!value) return 'Unknown';
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return value;
    return new Date(timestamp).toLocaleString();
};

const mapCatalogModelToCard = (model: HuggingFaceModelCard): ModelCard => {
    return {
        id: model.repo_id,
        repoId: model.repo_id,
        name: model.model_name,
        image: MODEL_CARD_IMAGE,
        description: model.description ?? null,
        sizeBytes: model.size_bytes ?? null,
        downloads: model.downloads ?? null,
        likes: model.likes ?? null,
        lastModified: model.last_modified ?? null,
        downloaded: model.downloaded,
        snapshotPath: model.snapshot_path ?? null,
        highestCheckpointStep: model.highest_checkpoint_step ?? null,
        pretrainedModelPath: model.pretrained_model_path ?? null,
        hasEnoughSpace: model.has_enough_space ?? null,
    };
};

const mapCardToSelectedModel = (card: ModelCard) => ({
    id: card.id,
    repoId: card.repoId,
    name: card.name,
    tier: 'downloaded' as const,
    image: card.image,
    highestCheckpointStep: card.highestCheckpointStep,
    policyType: null,
    fullRepoId: card.repoId,
    pretrainedModelPath: card.pretrainedModelPath,
});

export default function ModelsPage() {
    const { isKioskMode } = useAppMode();
    const [organizationInput, setOrganizationInput] = useState(DEFAULT_HUGGINGFACE_ORGANIZATION);
    const [organization, setOrganization] = useState(DEFAULT_HUGGINGFACE_ORGANIZATION);
    const [downloadingRepoId, setDownloadingRepoId] = useState<string | null>(null);
    const [replaceConfirmedRepoId, setReplaceConfirmedRepoId] = useState<string | null>(null);
    const [replaceRetriedRepoId, setReplaceRetriedRepoId] = useState<string | null>(null);
    const [downloadStatusText, setDownloadStatusText] = useState<string | null>(null);
    const [downloadProgressPercent, setDownloadProgressPercent] = useState<number | null>(null);
    const [isRunningModel, setIsRunningModel] = useState(false);
    const [isDeletingModel, setIsDeletingModel] = useState(false);
    const downloadResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const downloadingRepoIdRef = useRef<string | null>(null);
    const replaceConfirmedRepoIdRef = useRef<string | null>(null);
    const replaceRetriedRepoIdRef = useRef<string | null>(null);

    const {
        data: organizationCatalog,
        isLoading: isCatalogLoading,
        isFetching: isCatalogFetching,
        refetch: refetchOrganizationCatalog,
        error: catalogError,
    } = useQuery({
        queryKey: ['huggingface-organization-models', organization],
        queryFn: () => getHuggingFaceOrganizationModels(organization),
        enabled: !isKioskMode && !!organization.trim(),
        refetchOnWindowFocus: false,
    });

    const modelCards = useMemo(() => {
        return (organizationCatalog?.models ?? []).map(mapCatalogModelToCard);
    }, [organizationCatalog?.models]);

    const { data: selectedModel } = useSelectedModel();
    const selectedCard = useMemo(() => modelCards.find((model) => model.id === selectedModel?.id) ?? null, [modelCards, selectedModel?.id]);

    const { data: selectedRobot } = useSelectedRobot();
    const { data: pairedConnections } = usePairedRobotConnections();
    const { data: connectionStatuses } = useRobotConnectionStatuses();

    const selectedRobotNickname = selectedRobot?.nickname || '';
    const selectedConnection = selectedRobotNickname ? pairedConnections?.[selectedRobotNickname] : null;
    const isRobotConnected = !!(selectedRobotNickname && connectionStatuses?.[selectedRobotNickname]?.connected);

    useEffect(() => {
        return () => {
            if (downloadResetTimerRef.current) {
                clearTimeout(downloadResetTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        downloadingRepoIdRef.current = downloadingRepoId;
    }, [downloadingRepoId]);

    useEffect(() => {
        replaceConfirmedRepoIdRef.current = replaceConfirmedRepoId;
    }, [replaceConfirmedRepoId]);

    useEffect(() => {
        replaceRetriedRepoIdRef.current = replaceRetriedRepoId;
    }, [replaceRetriedRepoId]);

    useEffect(() => {
        if (isCatalogLoading) return;

        if (modelCards.length === 0) {
            if (selectedModel) {
                setSelectedModel(null);
            }
            return;
        }

        const selectedExists = !!selectedModel && modelCards.some((model) => model.id === selectedModel.id);
        if (!selectedExists) {
            setSelectedModel(mapCardToSelectedModel(modelCards[0] as ModelCard));
        }
    }, [isCatalogLoading, modelCards, selectedModel]);

    useEffect(() => {
        if (isKioskMode) {
            return;
        }

        let unlisten: (() => void) | null = null;
        void listen<HuggingFaceDownloadProgressEvent>('hf-model-download-progress', (event) => {
            if (!event.payload) return;
            const activeRepoId = downloadingRepoIdRef.current;
            if (activeRepoId && event.payload.repo_id !== activeRepoId) {
                return;
            }

            setDownloadStatusText(event.payload.status_text ?? 'Downloading model files...');
            setDownloadProgressPercent(
                typeof event.payload.progress_percent === 'number' ? Math.max(0, Math.min(100, event.payload.progress_percent)) : null
            );
        }).then((fn) => {
            unlisten = fn;
        });

        return () => {
            if (unlisten) {
                unlisten();
            }
        };
    }, [isKioskMode]);

    const handleSelectCard = (card: ModelCard) => {
        setSelectedModel(mapCardToSelectedModel(card));
    };

    const clearDownloadStateSoon = useCallback(() => {
        if (downloadResetTimerRef.current) {
            clearTimeout(downloadResetTimerRef.current);
        }
        downloadingRepoIdRef.current = null;
        replaceConfirmedRepoIdRef.current = null;
        replaceRetriedRepoIdRef.current = null;
        setDownloadingRepoId(null);
        setReplaceConfirmedRepoId(null);
        setReplaceRetriedRepoId(null);
        downloadResetTimerRef.current = setTimeout(() => {
            setDownloadStatusText(null);
            setDownloadProgressPercent(null);
            downloadResetTimerRef.current = null;
        }, 1200);
    }, []);

    const applyDownloadResult = useCallback(
        async (downloadedResult: NonNullable<HuggingFaceModelDownloadCompletionEvent['response']['result']>, successMessage: string) => {
            const downloadedCard = mapCatalogModelToCard(downloadedResult.model);
            await refetchOrganizationCatalog();
            setSelectedModel(mapCardToSelectedModel(downloadedCard));
            setDownloadStatusText('Download complete.');
            setDownloadProgressPercent(100);
            toast.success(successMessage, {
                ...toastSuccessDefaults,
            });
        },
        [refetchOrganizationCatalog]
    );

    const handleLoadOrganization = () => {
        const normalizedInput = organizationInput.trim();
        if (!normalizedInput) {
            toast.error('Enter a Hugging Face organization first (example: Mechanichris).', {
                ...toastErrorDefaults,
            });
            return;
        }
        if (normalizedInput === organization) {
            void refetchOrganizationCatalog();
            return;
        }
        setOrganization(normalizedInput);
    };

    const handleDownloadModel = async (repoId: string) => {
        if (downloadingRepoId) {
            return;
        }

        const model = modelCards.find((card) => card.repoId === repoId);
        const isReplace = !!model?.downloaded;
        if (isReplace) {
            const confirmed = window.confirm(`Model "${repoId}" already exists in cache. Replace it with a fresh download?`);
            if (!confirmed) {
                return;
            }
        }

        downloadingRepoIdRef.current = repoId;
        replaceConfirmedRepoIdRef.current = isReplace ? repoId : null;
        replaceRetriedRepoIdRef.current = null;
        setDownloadingRepoId(repoId);
        setReplaceConfirmedRepoId(isReplace ? repoId : null);
        setReplaceRetriedRepoId(null);
        setDownloadStatusText(isReplace ? 'Preparing replacement download...' : 'Starting download...');
        setDownloadProgressPercent(0);

        try {
            await startHuggingFaceModelDownload(repoId, isReplace);
        } catch (downloadError: unknown) {
            toast.error(getErrorMessage(downloadError), {
                ...toastErrorDefaults,
            });
            clearDownloadStateSoon();
        }
    };

    const handleDeleteSelectedModel = async () => {
        if (!selectedCard || !selectedCard.downloaded) {
            return;
        }
        if (downloadingRepoId) {
            toast.error('Wait for the current download to finish before deleting a model.', {
                ...toastErrorDefaults,
            });
            return;
        }

        const confirmed = window.confirm(
            `Delete "${selectedCard.repoId}" from Hugging Face cache?\n\nThis removes the local cached files for this model.`
        );
        if (!confirmed) {
            return;
        }

        setIsDeletingModel(true);
        try {
            const result = await deleteHuggingFaceModelFromCache(selectedCard.repoId);
            const refreshed = await refetchOrganizationCatalog();
            const refreshedModels = (refreshed.data?.models ?? []).map(mapCatalogModelToCard);
            const refreshedSelected = refreshedModels.find((model) => model.repoId === selectedCard.repoId) ?? null;

            if (refreshedSelected) {
                setSelectedModel(mapCardToSelectedModel(refreshedSelected));
            }

            toast.success(result.message, {
                ...toastSuccessDefaults,
            });
        } catch (deleteError: unknown) {
            toast.error(getErrorMessage(deleteError), {
                ...toastErrorDefaults,
            });
        } finally {
            setIsDeletingModel(false);
        }
    };

    useEffect(() => {
        if (isKioskMode) {
            return;
        }

        let unlisten: (() => void) | null = null;
        void listen<HuggingFaceModelDownloadCompletionEvent>('hf-model-download-complete', (event) => {
            const payload = event.payload;
            if (!payload) return;

            const repoId = payload.repo_id;
            if (downloadingRepoIdRef.current && repoId !== downloadingRepoIdRef.current) {
                return;
            }

            const handleCompletion = async () => {
                const response = payload.response;
                if (response.status === 'replace_required') {
                    if (replaceRetriedRepoIdRef.current === repoId) {
                        toast.error('Replace download still requires confirmation after retry. Please try again.', { ...toastErrorDefaults });
                        clearDownloadStateSoon();
                        return;
                    }

                    if (replaceConfirmedRepoIdRef.current !== repoId) {
                        const confirmed = window.confirm(`${response.message}\n\nDo you want to replace it now?`);
                        if (!confirmed) {
                            setDownloadStatusText('Replace canceled.');
                            setDownloadProgressPercent(0);
                            clearDownloadStateSoon();
                            return;
                        }
                        replaceConfirmedRepoIdRef.current = repoId;
                        setReplaceConfirmedRepoId(repoId);
                    }

                    replaceRetriedRepoIdRef.current = repoId;
                    setReplaceRetriedRepoId(repoId);
                    setDownloadStatusText('Replacing cached model...');
                    setDownloadProgressPercent(1);
                    try {
                        await startHuggingFaceModelDownload(repoId, true);
                    } catch (retryError: unknown) {
                        toast.error(getErrorMessage(retryError), {
                            ...toastErrorDefaults,
                        });
                        clearDownloadStateSoon();
                    }
                    return;
                }

                if (response.status === 'failed') {
                    toast.error(getErrorMessage(response.message || 'Download failed.'), {
                        ...toastErrorDefaults,
                    });
                    clearDownloadStateSoon();
                    return;
                }

                if (response.status === 'completed' && response.result) {
                    const wasReplace = replaceConfirmedRepoIdRef.current === repoId;
                    await applyDownloadResult(
                        response.result,
                        wasReplace
                            ? `Model "${response.result.model.model_name}" replaced in Hugging Face cache.`
                            : `Model "${response.result.model.model_name}" downloaded to Hugging Face cache.`
                    );
                    clearDownloadStateSoon();
                    return;
                }

                toast.error(getErrorMessage(response.message || 'Unexpected download response.'), {
                    ...toastErrorDefaults,
                });
                clearDownloadStateSoon();
            };

            void handleCompletion();
        }).then((fn) => {
            unlisten = fn;
        });

        return () => {
            if (unlisten) {
                unlisten();
            }
        };
    }, [applyDownloadResult, clearDownloadStateSoon, isKioskMode]);

    const handleRunSelectedModel = async () => {
        if (!selectedCard) {
            toast.error('Select a downloaded model first.', { ...toastErrorDefaults });
            return;
        }
        if (!selectedRobotNickname) {
            toast.error('Select a robot first from the Robots page.', { ...toastErrorDefaults });
            return;
        }
        if (!selectedConnection) {
            toast.error('Selected robot is not paired yet. Pair it from the Robots page.', { ...toastErrorDefaults });
            return;
        }
        if (!isRobotConnected) {
            toast.error('Selected robot is not connected. Press Connect from the Robots page first.', { ...toastErrorDefaults });
            return;
        }
        if (!selectedCard.downloaded) {
            toast.error('Download this model first.', {
                ...toastErrorDefaults,
            });
            return;
        }
        if (!selectedCard.pretrainedModelPath || selectedCard.highestCheckpointStep === null) {
            toast.error('This model does not contain a runnable pretrained checkpoint.', { ...toastErrorDefaults });
            return;
        }

        setIsRunningModel(true);
        try {
            const repoOwner = selectedCard.repoId.split('/')[0] ?? selectedCard.repoId;
            const result = await invoke<string>('start_remote_evaluate', {
                config: {
                    nickname: selectedRobotNickname,
                    remote_ip: selectedConnection.host,
                    model_name: selectedCard.name,
                    model_repo_id: repoOwner,
                    model_path: selectedCard.pretrainedModelPath,
                    model_steps: selectedCard.highestCheckpointStep,
                    dataset: {
                        dataset: selectedCard.name,
                        num_episodes: 1,
                        episode_time_s: 30,
                        reset_time_s: 1,
                        task: DEFAULT_EVALUATE_TASK,
                        fps: 30,
                    },
                },
            });

            toast.success(result || `Started model "${selectedCard.name}".`, {
                ...toastSuccessDefaults,
            });
        } catch (runError: unknown) {
            toast.error(getErrorMessage(runError), {
                ...toastErrorDefaults,
            });
        } finally {
            setIsRunningModel(false);
        }
    };

    const selectedModelCanRun = !!(
        selectedCard &&
        selectedCard.downloaded &&
        selectedCard.pretrainedModelPath &&
        selectedCard.highestCheckpointStep !== null
    );
    const selectedCardOutOfDisk = !!(selectedCard && !selectedCard.downloaded && selectedCard.hasEnoughSpace === false);
    const isSelectedDownloading = !!(selectedCard && downloadingRepoId === selectedCard.repoId);

    if (isKioskMode) {
        return (
            <div className="min-h-screen bg-slate-900/30 p-8">
                <div className="mx-auto max-w-4xl rounded-xl border border-slate-700 bg-slate-800/80 p-6 text-slate-300">
                    Model import and run controls are available in desktop mode only.
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900/30 p-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">AI Models</h1>
                    <p className="mt-2 text-slate-300">
                        Browse a Hugging Face organization, download models to the Hugging Face cache, then run the selected model checkpoint.
                    </p>
                </div>

                <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800/80 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="text-sm text-slate-300" htmlFor="hf-organization-input">
                            Organization
                        </label>
                        <input
                            id="hf-organization-input"
                            value={organizationInput}
                            onChange={(event) => setOrganizationInput(event.target.value)}
                            placeholder="Hugging Face organization"
                            className="w-full max-w-sm rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                        />
                        <button
                            onClick={handleLoadOrganization}
                            className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-700"
                        >
                            Load Models
                        </button>
                        <button
                            onClick={() => void refetchOrganizationCatalog()}
                            disabled={isCatalogFetching}
                            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                                isCatalogFetching
                                    ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                                    : 'cursor-pointer bg-slate-700 text-white hover:bg-slate-600'
                            }`}
                        >
                            {isCatalogFetching ? 'Refreshing...' : 'Refresh'}
                        </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-300">
                        <div>
                            <span className="font-semibold text-slate-100">Free Disk Space:</span>{' '}
                            {formatBytes(organizationCatalog?.free_bytes)}
                        </div>
                        <div>
                            <span className="font-semibold text-slate-100">Robot:</span> {selectedRobot?.name || 'None'}
                        </div>
                        <div>
                            <span className="font-semibold text-slate-100">Selected Model:</span> {selectedCard?.name || 'None'}
                        </div>
                    </div>

                    {downloadStatusText && (
                        <div className="space-y-2 border-t border-slate-700 pt-3 text-sm text-slate-300">
                            <div>
                                <span className="font-semibold text-slate-100">Download Status:</span>{' '}
                                {downloadingRepoId ? `${downloadingRepoId}: ` : ''}
                                {downloadStatusText}
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
                                <div
                                    className="h-full rounded-full bg-blue-500 transition-all duration-200"
                                    style={{ width: `${downloadProgressPercent ?? 0}%` }}
                                />
                            </div>
                            <div className="text-xs text-slate-400">
                                {downloadProgressPercent === null ? 'Preparing download...' : `${downloadProgressPercent.toFixed(1)}%`}
                            </div>
                        </div>
                    )}
                </div>

                <section className="rounded-2xl border border-slate-700 bg-slate-800/80 p-4">
                    <div className="grid grid-cols-1 gap-4 xl:h-[70vh] xl:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="min-h-0 rounded-xl border border-slate-700 bg-slate-900/40">
                            <div className="h-full overflow-y-auto p-4">
                                {isCatalogLoading && (
                                    <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-6 text-slate-300">
                                        Loading organization models...
                                    </div>
                                )}

                                {!isCatalogLoading && catalogError && (
                                    <div className="rounded-xl border border-red-700 bg-red-950/20 p-6 text-red-300">
                                        Failed to load organization catalog: {getErrorMessage(catalogError)}
                                    </div>
                                )}

                                {!isCatalogLoading && !catalogError && modelCards.length === 0 && (
                                    <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-6 text-slate-300">
                                        No models found for organization "{organization}".
                                    </div>
                                )}

                                {!isCatalogLoading && !catalogError && modelCards.length > 0 && (
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                        {modelCards.map((model) => {
                                            const isSelected = selectedCard?.id === model.id;
                                            return (
                                                <div
                                                    key={model.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => handleSelectCard(model)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            handleSelectCard(model);
                                                        }
                                                    }}
                                                    className={`group w-full cursor-pointer overflow-hidden rounded-2xl border-2 bg-slate-800 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                                                        isSelected
                                                            ? 'border-cyan-400/80 shadow-lg shadow-cyan-500/20'
                                                            : 'border-slate-700 hover:border-slate-500'
                                                    }`}
                                                >
                                                    <div className="border-b-2 border-slate-700 p-3">
                                                        <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
                                                            <Image
                                                                src={model.image}
                                                                alt={model.name}
                                                                fill
                                                                className="object-cover opacity-90 transition-all duration-300 group-hover:scale-105"
                                                                sizes="(max-width: 640px) 100vw, 33vw"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-3 p-4">
                                                        <div className="text-center text-lg font-semibold text-white">{model.name}</div>
                                                        {model.downloaded && (
                                                            <div className="text-center text-sm font-semibold text-emerald-300">Downloaded</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        <aside className="min-h-0 overflow-y-auto rounded-xl border border-slate-700 bg-slate-800/95 p-4">
                            {!selectedCard && (
                                <div className="text-sm text-slate-300">Select a model card to view detailed stats and actions.</div>
                            )}

                            {selectedCard && (
                                <div className="space-y-4">
                                    <div className="space-y-2 border-b border-slate-700 pb-4">
                                        <div className="text-xl font-semibold text-white">{selectedCard.name}</div>
                                        <div className="text-xs text-slate-400">{selectedCard.repoId}</div>
                                        <div className="text-sm text-slate-300">
                                            {selectedCard.description?.trim() || 'No description provided.'}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                                        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2">
                                            <div className="text-slate-400">Downloads</div>
                                            <div className="mt-1 text-sm font-semibold text-white">
                                                {formatCompactNumber(selectedCard.downloads)}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2">
                                            <div className="text-slate-400">Likes</div>
                                            <div className="mt-1 text-sm font-semibold text-white">
                                                {formatCompactNumber(selectedCard.likes)}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2">
                                            <div className="text-slate-400">Model Size</div>
                                            <div className="mt-1 text-sm font-semibold text-white">{formatBytes(selectedCard.sizeBytes)}</div>
                                        </div>
                                        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2">
                                            <div className="text-slate-400">Highest Checkpoint</div>
                                            <div className="mt-1 text-sm font-semibold text-white">
                                                {selectedCard.highestCheckpointStep === null
                                                    ? 'None found'
                                                    : selectedCard.highestCheckpointStep}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1 text-xs text-slate-300">
                                        <div>
                                            <span className="font-semibold text-slate-100">Updated:</span>{' '}
                                            {formatDate(selectedCard.lastModified)}
                                        </div>
                                    </div>

                                    <div className="space-y-2 border-t border-slate-700 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => void handleDownloadModel(selectedCard.repoId)}
                                            disabled={!!downloadingRepoId || isDeletingModel || selectedCardOutOfDisk}
                                            className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                                                !!downloadingRepoId || isDeletingModel || selectedCardOutOfDisk
                                                    ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                                                    : 'cursor-pointer bg-blue-600 text-white hover:bg-blue-700'
                                            }`}
                                        >
                                            {isSelectedDownloading
                                                ? 'Downloading...'
                                                : selectedCard.downloaded
                                                  ? 'Replace Download'
                                                  : 'Download to Cache'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleRunSelectedModel}
                                            disabled={
                                                !selectedConnection ||
                                                !isRobotConnected ||
                                                isRunningModel ||
                                                !selectedModelCanRun ||
                                                isDeletingModel
                                            }
                                            className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                                                !selectedConnection ||
                                                !isRobotConnected ||
                                                isRunningModel ||
                                                !selectedModelCanRun ||
                                                isDeletingModel
                                                    ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                                                    : 'cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700'
                                            }`}
                                        >
                                            {isRunningModel ? 'Starting...' : 'Run Model'}
                                        </button>

                                        {selectedCard.downloaded && (
                                            <button
                                                type="button"
                                                onClick={handleDeleteSelectedModel}
                                                disabled={isDeletingModel || !!downloadingRepoId}
                                                className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                                                    isDeletingModel || !!downloadingRepoId
                                                        ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                                                        : 'cursor-pointer bg-red-600 text-white hover:bg-red-700'
                                                }`}
                                            >
                                                {isDeletingModel ? 'Deleting Model...' : 'Delete Model From Cache'}
                                            </button>
                                        )}

                                        {selectedCardOutOfDisk && (
                                            <div className="rounded-lg border border-red-500/50 bg-red-900/20 px-3 py-2 text-xs text-red-200">
                                                Not enough free space. Required: {formatBytes(selectedCard.sizeBytes)}.
                                            </div>
                                        )}
                                        {!selectedModelCanRun && selectedCard.downloaded && (
                                            <div className="rounded-lg border border-amber-500/50 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
                                                Model is downloaded but not run-ready. Missing a valid checkpoint or `pretrained_model` path.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </aside>
                    </div>
                </section>
            </div>
        </div>
    );
}
