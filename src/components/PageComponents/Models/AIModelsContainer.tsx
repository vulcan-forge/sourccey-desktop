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
    const { data: ownedRobots, isLoading: isLoadingRobots }: any = useGetOwnedRobots(true);

    const models = useMemo(() => {
        return data?.pages.flatMap((page) => page?.data ?? []) ?? [];
    }, [data]);
    const selectedModel: any = models.find((model) => model.id === selectedModelId) ?? null;
    const selectedRobot = ownedRobots?.find((robot: any) => robot.id === selectedRobotId) ?? null;
    const selectedNickname = selectedRobot?.nickname ?? '';
    const { data: remoteConfig } = useGetRemoteConfig(selectedNickname);

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
            await downloadModel({ repoId });
            toast.success('Model download complete.', { ...toastSuccessDefaults });
            setIsDownloadModalOpen(false);
            setDownloadInput('');
            await refetch();
        } catch (error: any) {
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
                    models.map((model) => (
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
                                <span className="truncate">{model.model_path}</span>
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
                    ))}
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

            <GeneralModal isOpen={isDownloadModalOpen} onClose={() => setIsDownloadModalOpen(false)} title="Download Model" size="sm">
                <div className="space-y-4 rounded-lg border border-emerald-500/30 bg-slate-900/50 p-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-300">Model repo</label>
                        <input
                            value={downloadInput}
                            onChange={(event) => setDownloadInput(event.target.value)}
                            placeholder="org/model"
                            className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setIsDownloadModalOpen(false)}
                            className="rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500/70"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleDownloadModel}
                            disabled={isDownloading}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                                isDownloading
                                    ? 'cursor-not-allowed border border-slate-700/60 bg-slate-800/60 text-slate-400'
                                    : 'border border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:border-emerald-400/70'
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
