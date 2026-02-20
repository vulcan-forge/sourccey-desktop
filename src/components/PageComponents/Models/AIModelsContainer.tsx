'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FaSyncAlt, FaCube, FaCopy, FaRobot } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { useGetAiModelsInfinite, useSyncAiModelsFromCache } from '@/hooks/Models/AIModel/ai-model.hook';
import { useGetOwnedRobots } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import { SelectedModelPanel } from '@/components/PageComponents/Robots/AI/SelectedModelPanel';
import { useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';
import Link from 'next/link';

export const AIModelsContainer = () => {
    const pageSize = 18;
    const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, refetch } = useGetAiModelsInfinite(pageSize, true);
    const { mutateAsync: syncModels, isPending: isSyncing } = useSyncAiModelsFromCache();
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
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

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between rounded-xl border-2 border-slate-700/50 bg-slate-900/40 px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.28)]">
                <div>
                    <h2 className="text-lg font-semibold text-white">Cached AI Models</h2>
                    <p className="text-xs text-slate-400">Synced from your local cache directory.</p>
                </div>
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
        </div>
    );
};
