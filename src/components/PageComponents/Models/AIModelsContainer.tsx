'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FaSyncAlt, FaCube, FaCopy, FaRobot, FaDownload, FaFolderOpen } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import {
    useDownloadAiModelFromHuggingface,
    useGetAiModelCachePath,
    useGetAiModelsInfinite,
    useSyncAiModelsFromCache,
} from '@/hooks/Models/AIModel/ai-model.hook';
import { useGetOwnedRobots } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import { SelectedModelPanel } from '@/components/PageComponents/Robots/AI/SelectedModelPanel';
import { useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';
import Link from 'next/link';
import { GeneralModal } from '@/components/Elements/Modals/GeneralModal';
import { openPath } from '@tauri-apps/plugin-opener';
import { listen } from '@tauri-apps/api/event';

export const AIModelsContainer = () => {
    const pageSize = 18;
    const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, refetch } = useGetAiModelsInfinite(pageSize, true);
    const { mutateAsync: syncModels, isPending: isSyncing } = useSyncAiModelsFromCache();
    const { mutateAsync: downloadModel, isPending: isDownloading } = useDownloadAiModelFromHuggingface();
    const { data: cachePath } = useGetAiModelCachePath();
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [downloadInput, setDownloadInput] = useState('');
    const [downloadStatus, setDownloadStatus] = useState<'idle' | 'starting' | 'downloading' | 'stalled' | 'completed' | 'error'>('idle');
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
    const [downloadedBytes, setDownloadedBytes] = useState<number | null>(null);
    const [totalBytes, setTotalBytes] = useState<number | null>(null);
    const [downloadSpeedBps, setDownloadSpeedBps] = useState<number | null>(null);
    const [stallSeconds, setStallSeconds] = useState<number>(0);
    const [currentFile, setCurrentFile] = useState<string | null>(null);
    const [currentFileBytes, setCurrentFileBytes] = useState<number | null>(null);
    const [currentFileTotalBytes, setCurrentFileTotalBytes] = useState<number | null>(null);
    const [activeDownloadRepo, setActiveDownloadRepo] = useState<string | null>(null);
    const activeDownloadRepoRef = useRef<string | null>(null);
    const completionHandledRef = useRef(false);
    const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { data: ownedRobots, isLoading: isLoadingRobots }: any = useGetOwnedRobots(true);

    const models = useMemo(() => {
        return data?.pages.flatMap((page) => page?.data ?? []) ?? [];
    }, [data]);
    const selectedModel: any = models.find((model) => model.id === selectedModelId) ?? null;
    const selectedRobot = ownedRobots?.find((robot: any) => robot.id === selectedRobotId) ?? null;
    const selectedNickname = selectedRobot?.nickname ?? '';
    const { data: remoteConfig } = useGetRemoteConfig(selectedNickname);

    const formatBytes = (value?: number | null): string => {
        if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return '--';
        if (value === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
        const scaled = value / Math.pow(1024, exponent);
        const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
        return `${scaled.toFixed(digits)} ${units[exponent]}`;
    };

    const formatDuration = (seconds: number): string => {
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remain = seconds % 60;
        if (minutes < 60) return `${minutes}m ${remain}s`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    };

    useEffect(() => {
        if (!sentinelRef.current) return;
        if (!hasNextPage || isFetchingNextPage) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    fetchNextPage();
                }
            },
            { rootMargin: '200px' }
        );

        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    useEffect(() => {
        activeDownloadRepoRef.current = activeDownloadRepo;
    }, [activeDownloadRepo]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        listen('ai-model-download-progress', (event) => {
            const payload = event.payload as {
                repoId?: string;
                status?: 'starting' | 'downloading' | 'stalled' | 'completed' | 'error';
                progress?: number | null;
                message?: string;
                current?: number | null;
                total?: number | null;
                downloadedBytes?: number | null;
                totalBytes?: number | null;
                speedBps?: number | null;
                stallSeconds?: number | null;
                currentFile?: string | null;
                currentFileBytes?: number | null;
                currentFileTotalBytes?: number | null;
            };

            const trackedRepo = activeDownloadRepoRef.current;
            if (!trackedRepo) {
                return;
            }
            if (payload?.repoId && payload.repoId !== trackedRepo) {
                return;
            }

            if (payload?.status) {
                setDownloadStatus(payload.status);
            }

            if (typeof payload?.progress === 'number') {
                const normalized = Math.max(0, Math.min(100, Math.round(payload.progress)));
                setDownloadProgress(normalized);
            } else if (typeof payload?.downloadedBytes === 'number' && typeof payload?.totalBytes === 'number' && payload.totalBytes > 0) {
                const computed = Math.round((payload.downloadedBytes / payload.totalBytes) * 100);
                setDownloadProgress(Math.max(0, Math.min(100, computed)));
            } else if (typeof payload?.current === 'number' && typeof payload?.total === 'number' && payload.total > 0) {
                const computed = Math.round((payload.current / payload.total) * 100);
                setDownloadProgress(Math.max(0, Math.min(100, computed)));
            }

            if (payload?.message) {
                setDownloadMessage(payload.message);
            }

            if (typeof payload?.downloadedBytes === 'number') {
                setDownloadedBytes(payload.downloadedBytes);
            }
            if (typeof payload?.totalBytes === 'number') {
                setTotalBytes(payload.totalBytes);
            }
            if (typeof payload?.speedBps === 'number') {
                setDownloadSpeedBps(payload.speedBps);
            }
            if (typeof payload?.stallSeconds === 'number') {
                setStallSeconds(Math.max(0, Math.round(payload.stallSeconds)));
            }
            if ('currentFile' in payload) {
                setCurrentFile(payload.currentFile ?? null);
            }
            if (typeof payload?.currentFileBytes === 'number') {
                setCurrentFileBytes(payload.currentFileBytes);
            } else if ('currentFileBytes' in payload && payload.currentFileBytes === null) {
                setCurrentFileBytes(null);
            }
            if (typeof payload?.currentFileTotalBytes === 'number') {
                setCurrentFileTotalBytes(payload.currentFileTotalBytes);
            } else if ('currentFileTotalBytes' in payload && payload.currentFileTotalBytes === null) {
                setCurrentFileTotalBytes(null);
            }
        }).then((fn) => {
            unlisten = fn;
        });

        return () => {
            if (unlisten) {
                unlisten();
            }
        };
    }, []);

    useEffect(() => {
        if (!isDownloadModalOpen) {
            completionHandledRef.current = false;
            if (completionTimeoutRef.current) {
                clearTimeout(completionTimeoutRef.current);
                completionTimeoutRef.current = null;
            }
            setDownloadStatus('idle');
            setDownloadProgress(null);
            setDownloadMessage(null);
            setDownloadedBytes(null);
            setTotalBytes(null);
            setDownloadSpeedBps(null);
            setStallSeconds(0);
            setCurrentFile(null);
            setCurrentFileBytes(null);
            setCurrentFileTotalBytes(null);
            setActiveDownloadRepo(null);
            activeDownloadRepoRef.current = null;
        }
    }, [isDownloadModalOpen]);

    useEffect(() => {
        if (!isDownloadModalOpen) return;
        if (downloadStatus !== 'completed') return;
        if (downloadProgress !== 100) return;
        if (completionHandledRef.current) return;

        completionHandledRef.current = true;
        completionTimeoutRef.current = setTimeout(() => {
            setIsDownloadModalOpen(false);
            setDownloadInput('');
            setActiveDownloadRepo(null);
            toast.success('Model download complete.', { ...toastSuccessDefaults });
            void refetch();
            completionTimeoutRef.current = null;
        }, 450);
    }, [downloadProgress, downloadStatus, isDownloadModalOpen, refetch]);

    const handleRefresh = async () => {
        await syncModels();
        await refetch();
    };

    const parseHuggingFaceInput = (input: string): string | null => {
        const trimmed = input.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            try {
                const url = new URL(trimmed);
                const host = url.hostname.toLowerCase();
                if (!host.endsWith('huggingface.co') && !host.endsWith('hf.co')) {
                    return null;
                }
                const parts = url.pathname.split('/').filter(Boolean);
                const [owner, repo] = parts;
                if (!owner || !repo) return null;
                return `${owner}/${repo.replace(/\.git$/i, '')}`;
            } catch {
                return null;
            }
        }

        const parts = trimmed.split('/').filter(Boolean);
        const [owner, repo] = parts;
        if (!owner || !repo) return null;
        return trimmed.replace(/\.git$/i, '');
    };

    const handleDownloadModel = async () => {
        const repoId = parseHuggingFaceInput(downloadInput);
        if (!repoId) {
            toast.error('Enter a valid Hugging Face repo URL or repo ID (org/model).', { ...toastErrorDefaults });
            return;
        }

        try {
            completionHandledRef.current = false;
            if (completionTimeoutRef.current) {
                clearTimeout(completionTimeoutRef.current);
                completionTimeoutRef.current = null;
            }
            setActiveDownloadRepo(repoId);
            activeDownloadRepoRef.current = repoId;
            setDownloadStatus('starting');
            setDownloadProgress(0);
            setDownloadMessage(null);
            setDownloadedBytes(0);
            setTotalBytes(null);
            setDownloadSpeedBps(null);
            setStallSeconds(0);
            setCurrentFile(null);
            setCurrentFileBytes(null);
            setCurrentFileTotalBytes(null);
            await downloadModel({ repoId });
            setDownloadStatus('completed');
            setDownloadProgress(100);
        } catch (error: any) {
            console.error(error);
            setDownloadStatus('error');
            setDownloadMessage(error?.message || 'Model download failed.');
            toast.error(error?.message || 'Model download failed.', { ...toastErrorDefaults });
        }
    };

    const handleOpenCacheDir = async () => {
        if (!cachePath) return;
        try {
            await openPath(cachePath);
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : 'Failed to open cache directory.';
            toast.error(message, { ...toastErrorDefaults });
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between rounded-xl border-2 border-slate-700/50 bg-slate-900/40 px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.28)]">
                <div>
                    <h2 className="text-lg font-semibold text-white">Your AI Models</h2>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>Synced from your local cache directory.</span>
                        <button
                            type="button"
                            onClick={handleOpenCacheDir}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-slate-700/60 bg-slate-900/60 px-2 py-0.5 text-[10px] text-emerald-200 hover:border-emerald-400/60 hover:text-emerald-100"
                        >
                            <FaFolderOpen className="h-3 w-3" />
                            Open cache
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsDownloadModalOpen(true)}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-500/50 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:border-emerald-400/70 hover:text-emerald-100"
                    >
                        <FaDownload />
                        Download Model
                    </button>
                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={isSyncing}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                            isSyncing
                                ? 'cursor-not-allowed border-slate-700 bg-slate-800/60 text-slate-400'
                                : 'border-amber-500/50 bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-200 hover:border-amber-400/70 hover:text-amber-100'
                        }`}
                    >
                        <FaSyncAlt className={isSyncing ? 'animate-spin' : ''} />
                        {isSyncing ? 'Syncing...' : 'Refresh'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {isLoading &&
                    Array.from({ length: 6 }).map((_, idx) => (
                        <div key={`skeleton-${idx}`} className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
                            <div className="h-4 w-24 rounded bg-slate-700/40"></div>
                            <div className="mt-3 h-3 w-full rounded bg-slate-800/40"></div>
                            <div className="mt-2 h-3 w-2/3 rounded bg-slate-800/40"></div>
                        </div>
                    ))}

                {!isLoading &&
                    models.map((model) => {
                        const relativeFromCache =
                            typeof cachePath === 'string' && model.model_path.startsWith(cachePath)
                                ? model.model_path.slice(cachePath.length).replace(/^[/\\]+/, '')
                                : null;
                        const displayPath = model.model_path_relative ?? relativeFromCache ?? model.model_path;

                        return (
                        <div
                            key={model.id}
                            className={`flex cursor-pointer flex-col gap-3 rounded-xl border-2 p-4 transition-all ${
                                selectedModelId === model.id
                                    ? 'border-amber-400/70 bg-amber-500/10 shadow-[0_10px_24px_rgba(251,146,60,0.15)]'
                                    : 'border-slate-700/50 bg-slate-900/30 hover:border-amber-400/40 hover:bg-slate-900/45'
                            }`}
                            onClick={() => {
                                setSelectedModelId(model.id);
                                setSelectedRobotId(null);
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20">
                                    <FaCube className="text-amber-300" />
                                </div>
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-white">{model.name}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <span className="text-slate-300">Path:</span>
                                <span className="truncate">{displayPath}</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void navigator.clipboard.writeText(model.model_path);
                                        toast.success('Copied to clipboard', { ...toastSuccessDefaults });
                                    }}
                                    className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-700/60 bg-slate-900/60 px-2 py-1 text-[10px] text-slate-300 hover:border-amber-400/50 hover:text-amber-100"
                                >
                                    <FaCopy className="h-3 w-3" />
                                    Copy
                                </button>
                            </div>
                        </div>
                        );
                    })}
            </div>

            {!isLoading && models.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
                    No AI models found. Click refresh to sync from your cache directory.
                </div>
            )}

            <div ref={sentinelRef} />

            {isFetchingNextPage && <div className="text-center text-xs text-slate-400">Loading more models...</div>}

            {selectedModel && (
                <div className="rounded-xl border-2 border-slate-700/60 bg-slate-900/40 p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-white">Run Model</h3>
                            <p className="text-xs text-slate-400">Select a robot to run: {selectedModel.name}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedModelId(null);
                                setSelectedRobotId(null);
                            }}
                            className="cursor-pointer rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-400/50"
                        >
                            Clear
                        </button>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {isLoadingRobots && <div className="col-span-full text-xs text-slate-400">Loading robots...</div>}
                        {!isLoadingRobots && (!ownedRobots || ownedRobots.length === 0) && (
                            <div className="col-span-full rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">
                                No robots found. Add or discover a robot first.
                                <div className="mt-3">
                                    <Link
                                        href="/app/robots"
                                        className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 hover:border-amber-400/70"
                                    >
                                        Discover Robots
                                    </Link>
                                </div>
                            </div>
                        )}
                        {!isLoadingRobots &&
                            ownedRobots?.map((robot: any) => {
                                const isSelected = selectedRobotId === robot.id;
                                return (
                                    <button
                                        key={robot.id}
                                        type="button"
                                        onClick={() => setSelectedRobotId(robot.id)}
                                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 text-left transition-all ${
                                            isSelected
                                                ? 'border-amber-400/70 bg-amber-500/10'
                                                : 'border-slate-700/60 bg-slate-900/60 hover:border-amber-400/40'
                                        }`}
                                    >
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-800">
                                            <FaRobot className="text-amber-300" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-white">{robot.robot?.name ?? 'Robot'}</div>
                                            <div className="text-xs text-slate-400">@{robot.nickname}</div>
                                        </div>
                                    </button>
                                );
                            })}
                    </div>

                    {selectedRobot && (
                        <div className="mt-6">
                            <SelectedModelPanel
                                model={selectedModel}
                                ownedRobot={selectedRobot}
                                remoteConfig={remoteConfig}
                                onClearAction={() => setSelectedRobotId(null)}
                            />
                        </div>
                    )}
                </div>
            )}

            <GeneralModal
                isOpen={isDownloadModalOpen}
                onClose={() => setIsDownloadModalOpen(false)}
                title="Download AI Models"
                size="sm"
                borderClassName="border-2 border-slate-600"
            >
                <div className="space-y-4 rounded-lg border-slate-700/50 bg-slate-900 p-4">
                    <div className="space-y-3">
                        <label className="text-xs font-semibold text-slate-300">Model repo</label>
                        <input
                            value={downloadInput}
                            onChange={(event) => setDownloadInput(event.target.value)}
                            placeholder="Enter Hugging Face repo URL or repo ID (org/model)"
                            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-emerald-400/60 focus:outline-none"
                        />
                    </div>

                    {downloadStatus !== 'idle' && (
                        <div className="space-y-2 rounded-md border border-slate-700/60 bg-slate-900/70 px-3 py-2">
                            <div className="flex items-center justify-between text-[11px] text-slate-300">
                                <span>
                                    {downloadStatus === 'completed'
                                        ? 'Download complete'
                                        : downloadStatus === 'error'
                                          ? 'Download failed'
                                          : downloadStatus === 'stalled'
                                            ? 'Download stalled'
                                            : downloadStatus === 'starting'
                                              ? 'Preparing download'
                                              : 'Downloading from Hugging Face'}
                                </span>
                                {typeof downloadProgress === 'number' && <span>{downloadProgress}%</span>}
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                                <div
                                    className={`h-2 rounded-full transition-all ${
                                        downloadStatus === 'error'
                                            ? 'bg-red-500/70'
                                            : downloadStatus === 'stalled'
                                              ? 'bg-amber-400/80'
                                              : 'bg-emerald-400/80'
                                    } ${downloadProgress === null ? 'w-1/3 animate-pulse' : ''}`}
                                    style={downloadProgress !== null ? { width: `${downloadProgress}%` } : undefined}
                                />
                            </div>
                            <div className="text-[11px] text-slate-300">
                                {`Transferred ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`}
                                {downloadSpeedBps && downloadStatus !== 'completed' ? ` at ${formatBytes(downloadSpeedBps)}/s` : ''}
                            </div>
                            {currentFile && downloadStatus !== 'completed' && (
                                <div className="space-y-1 text-[11px] text-slate-400">
                                    <div className="overflow-x-auto rounded border border-slate-700/60 bg-slate-950/30 px-2 py-1 whitespace-nowrap">
                                        {`Current file: ${currentFile}`}
                                    </div>
                                    {currentFileTotalBytes && (
                                        <div>{`${formatBytes(currentFileBytes)} / ${formatBytes(currentFileTotalBytes)}`}</div>
                                    )}
                                </div>
                            )}
                            {downloadStatus === 'stalled' && (
                                <div className="text-[11px] text-amber-300">
                                    {`No byte progress for ${formatDuration(stallSeconds)}. Download is still running and will resume once data flows.`}
                                </div>
                            )}
                            {downloadMessage && (
                                <div className={`text-[11px] ${downloadStatus === 'error' ? 'text-red-300' : 'text-slate-300'}`}>
                                    {downloadMessage}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                        {isDownloading && (
                            <div className="pr-2 text-[11px] text-amber-200/90">
                                Some robotics models are very large and will take a long time to download
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={handleDownloadModel}
                            disabled={isDownloading}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                                isDownloading
                                    ? 'cursor-not-allowed border border-slate-700/60 bg-slate-800/60 text-slate-400'
                                    : 'cursor-pointer border border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:border-emerald-400/70'
                            }`}
                        >
                            {isDownloading ? 'Downloading...' : 'Download'}
                        </button>
                    </div>
                </div>
            </GeneralModal>
        </div>
    );
};
