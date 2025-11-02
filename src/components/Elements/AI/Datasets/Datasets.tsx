import { formatFileSize } from '@/utils/file';
import { FaSpinner, FaDatabase, FaFolder, FaEye, FaSync } from 'react-icons/fa';
import InfiniteScroll from 'react-infinite-scroller';
import { Tooltip } from 'react-tooltip';
import React, { useState, useEffect } from 'react';
import { BASE_DATASET_KEY, setSelectedDatasets, useGetSelectedDatasets } from '@/hooks/Components/AI/Dataset/dataset.hook';
import Link from 'next/link';
import { setDataBackButton } from '@/hooks/Components/Back/back-button.hook';
import { invoke } from '@tauri-apps/api/core';
import { Spinner } from '@/components/Elements/Spinner';
import { queryClient } from '@/hooks/default';
import { toast } from 'react-toastify';
import { toastSuccessDefaults } from '@/utils/toast/toast-utils';

export const Datasets = ({
    datasets,
    isLoading,
    fetchNextPage,
    hasNextPage,
    totalCount,
    currentPage,
    totalPages,
    nickname,
    error,
}: {
    datasets: any[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    totalCount: number;
    currentPage: number;
    totalPages: number;
    nickname: string | null;
    error: any;
}) => {
    return (
        <div className="flex h-full w-full flex-col rounded-xl border-2 border-slate-700 bg-slate-800 p-3 backdrop-blur-sm sm:p-6">
            <DatasetsRaw
                datasets={datasets}
                isLoading={isLoading}
                fetchNextPage={fetchNextPage}
                hasNextPage={hasNextPage}
                totalCount={totalCount}
                currentPage={currentPage}
                totalPages={totalPages}
                nickname={nickname}
                error={error}
            />
        </div>
    );
};

export const DatasetsRaw = ({
    datasets,
    isLoading,
    fetchNextPage,
    hasNextPage,
    totalCount,
    currentPage,
    totalPages,
    nickname,
    error,
}: {
    datasets: any[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    totalCount: number;
    currentPage: number;
    totalPages: number;
    nickname: string | null;
    error: any;
}) => {
    const [isCombiningDatasets, setIsCombiningDatasets] = useState(false);
    const [isRefreshingDatasets, setIsRefreshingDatasets] = useState(false);
    const [hasInitialized, setHasInitialized] = useState(false);
    const { data: selectedDatasets = [] }: any = useGetSelectedDatasets();

    useEffect(() => {
        if (!isLoading && datasets.length > 0 && !hasInitialized) {
            setSelectedDatasets([datasets[0]]);
            setHasInitialized(true);
        }
    }, [isLoading, datasets, hasInitialized]);

    const handleDatasetClick = (dataset: any) => {
        setSelectedDatasets((prev: any[] = []) => {
            const exists = prev.some((d) => d.path === dataset.path);
            if (exists) {
                return prev.filter((d) => d.path !== dataset.path);
            } else {
                return [dataset, ...prev];
            }
        });
    };

    const handleCombineDatasets = async () => {
        try {
            setIsCombiningDatasets(true);

            const datasets = selectedDatasets.map((dataset: any) => ({
                nickname: dataset.nickname,
                dataset: dataset.dataset,
            }));

            const firstNickname = datasets[0].nickname;
            const firstDataset = datasets[0].dataset;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Remove colons and milliseconds
            const outputDatasetStr = `${firstDataset}__combined_${timestamp}`;

            const outputDataset = {
                nickname: firstNickname,
                dataset: outputDatasetStr,
            };
            await invoke('combine_datasets', { datasets: datasets, outputDataset: outputDataset });

            toast.success('Datasets combining, please wait a few seconds then refresh', { ...toastSuccessDefaults });
        } catch (error) {
            console.error('Error combining datasets', error);
        } finally {
            setIsCombiningDatasets(false);
        }
    };

    const handleRefreshDatasets = async () => {
        setIsRefreshingDatasets(true);
        queryClient.invalidateQueries({ queryKey: [BASE_DATASET_KEY] });
        setIsRefreshingDatasets(false);

        toast.success('Datasets refreshed', { ...toastSuccessDefaults });
    };

    if (isLoading) {
        return (
            <div className="flex h-72 flex-col items-center gap-2 py-8 text-center">
                <FaSpinner className="h-8 w-8 animate-spin text-blue-500" />
                <span className="ml-3 text-slate-300">Loading datasets...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-72 flex-col py-8 text-center">
                <div className="mb-2 text-red-400">Error loading datasets</div>
                <div className="text-sm text-slate-400">{error?.message}</div>
            </div>
        );
    }

    if (datasets.length === 0) {
        const message = nickname ? `No datasets found for "${nickname}" in the lerobot cache directory.` : 'No datasets found.';
        return (
            <div className="flex h-72 flex-col py-8 text-center">
                <FaDatabase className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                <h3 className="mb-2 text-lg font-medium text-slate-300">No datasets found</h3>
                <p className="text-slate-400">{message}</p>
            </div>
        );
    }

    return (
        <div>
            <DatasetsHeader
                totalCount={totalCount}
                currentPage={currentPage}
                totalPages={totalPages}
                selectedDatasets={selectedDatasets}
                isCombiningDatasets={isCombiningDatasets}
                isRefreshingDatasets={isRefreshingDatasets}
                onCombineClick={handleCombineDatasets}
                onRefreshClick={handleRefreshDatasets}
            />
            <DatasetsContainer
                datasets={datasets}
                isLoading={isLoading}
                fetchNextPage={fetchNextPage}
                hasNextPage={hasNextPage}
                selectedDatasets={selectedDatasets}
                onSelect={handleDatasetClick}
            />
        </div>
    );
};

const DatasetsHeader = ({
    totalCount,
    currentPage,
    totalPages,
    selectedDatasets,
    isCombiningDatasets,
    isRefreshingDatasets,
    onCombineClick,
    onRefreshClick,
}: {
    totalCount: number;
    currentPage: number;
    totalPages: number;
    selectedDatasets: any[];
    isCombiningDatasets: boolean;
    isRefreshingDatasets: boolean;
    onCombineClick: () => Promise<void>;
    onRefreshClick: () => Promise<void>;
}) => {
    const datasetData = selectedDatasets.length > 0 ? selectedDatasets[0] : null;

    let datasetURL = null;
    const currentURL = window?.location?.pathname;
    if (!!datasetData) {
        const { nickname, dataset } = datasetData;
        datasetURL = `/app/data?nickname=${nickname}&dataset=${dataset}`;
    }
    return (
        <div className="mb-4 flex items-center justify-between border-b-2 border-slate-700 pb-4">
            <div>
                <h2 className="text-xl font-semibold text-white">Datasets</h2>
            </div>
            <div className="flex items-center gap-2">
                <div className="h-10"></div>
                {datasetData && (
                    <Link
                        href={datasetURL ?? ''}
                        onClick={() => setDataBackButton(currentURL)}
                        className="hover:bg-slate-675 inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-slate-700 px-3 text-sm font-medium text-slate-300 transition-all hover:text-white"
                    >
                        <FaEye className="h-4 w-4" />
                        View Dataset
                    </Link>
                )}
                {selectedDatasets.length > 1 && (
                    <button
                        className="hover:bg-slate-675 flex h-10 w-48 cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-700 px-3 text-sm font-medium text-slate-300 transition-all hover:text-white"
                        onClick={onCombineClick}
                        disabled={selectedDatasets.length < 2}
                    >
                        {isCombiningDatasets ? (
                            <Spinner color="blue" />
                        ) : (
                            <>
                                <FaDatabase className="h-4 w-4" />
                                Combine Datasets
                            </>
                        )}
                    </button>
                )}
                <button
                    className="hover:bg-slate-675 flex h-10 w-24 cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-700 px-3 text-sm font-medium text-slate-300 transition-all hover:text-white"
                    onClick={onRefreshClick}
                >
                    {isRefreshingDatasets ? (
                        <>
                            <Spinner color="blue" />
                        </>
                    ) : (
                        <>
                            <FaSync className="h-4 w-4" />
                            Refresh
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

const DatasetsContainer = ({
    datasets,
    isLoading,
    fetchNextPage,
    hasNextPage,
    selectedDatasets,
    onSelect,
}: {
    datasets: any[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    selectedDatasets: any[];
    onSelect: (dataset: any) => void;
}) => {
    return (
        <div className="flex h-128 flex-col">
            <div className="hidden h-full lg:block">
                <DatasetsRowContainer
                    datasets={datasets}
                    isLoading={isLoading}
                    fetchNextPage={fetchNextPage}
                    hasNextPage={hasNextPage}
                    selectedDatasets={selectedDatasets}
                    onSelect={onSelect}
                />
            </div>

            <div className="block h-full overflow-y-auto lg:hidden">
                <DatasetsGridContainer
                    datasets={datasets}
                    isLoading={isLoading}
                    fetchNextPage={fetchNextPage}
                    hasNextPage={hasNextPage}
                    selectedDatasets={selectedDatasets}
                    onSelect={onSelect}
                />
            </div>
        </div>
    );
};

const DatasetsRowContainer = ({
    datasets,
    isLoading,
    fetchNextPage,
    hasNextPage,
    selectedDatasets,
    onSelect,
}: {
    datasets: any[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    selectedDatasets: any[];
    onSelect: (dataset: any) => void;
}) => {
    return (
        <div className="flex h-full w-full flex-col overflow-x-auto">
            <div className="scrollbar-left h-full w-full min-w-[1200px] overflow-y-scroll pr-4 pl-2">
                <div className="sticky top-0 z-10 flex w-full gap-6 bg-slate-800 pb-4 backdrop-blur-sm">
                    <div className="flex w-64 flex-none items-center text-sm font-medium text-slate-400">Repository</div>
                    <div className="flex w-64 flex-none items-center text-sm font-medium text-slate-400">Dataset</div>
                    <div className="flex w-24 flex-none items-center text-sm font-medium text-slate-400">Episodes</div>
                    <div className="flex w-24 flex-none items-center text-sm font-medium text-slate-400">Size</div>
                    <div className="flex w-80 flex-none items-center text-sm font-medium text-slate-400">Tasks</div>
                </div>

                {!isLoading && (
                    <InfiniteScroll
                        className="flex flex-col"
                        pageStart={0}
                        loadMore={fetchNextPage}
                        hasMore={hasNextPage}
                        loader={
                            <div className="flex h-16 w-full items-center justify-center py-4" key={0}>
                                <FaSpinner className="h-6 w-6 animate-spin text-blue-500" />
                                <span className="ml-2 text-sm text-slate-400">Loading more datasets...</span>
                            </div>
                        }
                        useWindow={false}
                    >
                        {datasets.map((dataset: any) => (
                            <DatasetsRowItem
                                key={dataset.path}
                                dataset={dataset}
                                selected={!!selectedDatasets.find((d) => d.path === dataset.path)}
                                onSelect={onSelect}
                            />
                        ))}
                    </InfiniteScroll>
                )}
            </div>
        </div>
    );
};

const DatasetsRowItem = ({ dataset, selected, onSelect }: { dataset: any; selected: boolean; onSelect: (dataset: any) => void }) => {
    const firstTask = dataset?.tasks?.task_list?.[0];
    const size = formatFileSize(dataset?.size);

    const nickname = dataset?.nickname;
    const datasetName = dataset?.dataset;
    return (
        <div className={`group flex w-full cursor-pointer pb-2`} onClick={() => onSelect(dataset)}>
            <div className={`flex cursor-pointer gap-6 rounded-xl p-4 transition-colors ${selected ? 'bg-slate-700' : 'hover:bg-slate-725'}`}>
                <div className="flex w-60 min-w-0 flex-none items-center gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-yellow-500/30">
                        <FaFolder className="h-4 w-4 text-yellow-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div
                            className="line-clamp-2 cursor-pointer font-medium text-white"
                            data-tooltip-id={`repoId-${nickname}`}
                            data-tooltip-content={nickname}
                        >
                            {nickname}
                        </div>
                        <Tooltip
                            id={`repoId-${nickname}`}
                            place="top"
                            className="max-w-xs break-words whitespace-pre-wrap"
                            style={{
                                backgroundColor: '#171d26',
                                color: '#f1f5f9',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                fontSize: '14px',
                                zIndex: 1000,
                            }}
                            border="2px solid #334155"
                        />
                    </div>
                </div>
                <div className="flex w-64 min-w-0 flex-none items-center gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                        <FaDatabase className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div
                            className="line-clamp-2 cursor-pointer font-medium text-white"
                            data-tooltip-id={`dataset-${datasetName}`}
                            data-tooltip-content={datasetName}
                        >
                            {datasetName}
                        </div>
                        <Tooltip
                            id={`dataset-${datasetName}`}
                            place="top"
                            className="max-w-xs break-words whitespace-pre-wrap"
                            style={{
                                backgroundColor: '#171d26',
                                color: '#f1f5f9',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                fontSize: '14px',
                                zIndex: 1000,
                            }}
                            border="2px solid #334155"
                        />
                    </div>
                </div>
                <div className="flex w-24 flex-none flex-shrink-0 items-center justify-start">
                    <div className="text-lg font-bold text-slate-300">{dataset?.episodes}</div>
                </div>
                <div className="flex w-24 flex-none flex-shrink-0 items-center justify-start">
                    <div className="text-sm text-slate-300">{size}</div>
                </div>
                <div className="flex w-80 min-w-0 flex-none items-center">
                    <div className="flex items-center gap-2">
                        <div className="flex-shrink-0 text-sm font-bold text-slate-300">({dataset?.tasks?.total_tasks})</div>
                        <div className="line-clamp-3 min-w-0 flex-1 text-sm text-slate-300" title={firstTask}>
                            {firstTask}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const DatasetsGridContainer = ({
    datasets,
    isLoading,
    fetchNextPage,
    hasNextPage,
    selectedDatasets,
    onSelect,
}: {
    datasets: any[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    selectedDatasets: any[];
    onSelect: (dataset: any) => void;
}) => {
    return (
        <div className="flex h-full w-full flex-col overflow-y-auto pr-2">
            {!isLoading && (
                <InfiniteScroll
                    className="flex w-full flex-col"
                    loadMore={fetchNextPage}
                    hasMore={hasNextPage}
                    loader={
                        <div key={0} className="flex h-16 w-full items-center justify-center py-4">
                            <FaSpinner className="h-6 w-6 animate-spin text-blue-500" />
                            <span className="ml-2 text-sm text-slate-400">Loading more datasets...</span>
                        </div>
                    }
                    useWindow={false}
                >
                    <div className="grid gap-6 sm:grid-cols-1">
                        {datasets.map((dataset: any) => (
                            <DatasetsGridItem
                                key={dataset.path}
                                dataset={dataset}
                                selected={!!selectedDatasets.find((d) => d.path === dataset.path)}
                                onSelect={onSelect}
                            />
                        ))}
                    </div>
                </InfiniteScroll>
            )}
        </div>
    );
};

const DatasetsGridItem = ({ dataset, selected, onSelect }: { dataset: any; selected: boolean; onSelect: (dataset: any) => void }) => {
    const firstTask = dataset?.tasks?.task_list?.[0];
    const size = formatFileSize(dataset?.size);

    const nickname = dataset?.nickname;
    const datasetName = dataset?.dataset;
    const repoId = `${nickname}/${datasetName}`;
    return (
        <div
            className={`bg-slate-825 relative flex h-full cursor-pointer flex-col gap-4 rounded-xl border-2 border-slate-700 p-4 transition-all duration-200`}
            onClick={() => onSelect(dataset)}
        >
            {/* Dataset Header */}
            <div className="bg-slate-725 flex items-start gap-4 rounded-lg p-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/20 shadow-lg">
                    <FaFolder className="h-6 w-6 text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-lg font-semibold text-white group-hover:text-blue-100">{repoId}</div>
                </div>
            </div>

            {/* Tasks Section */}
            <div className="bg-slate-725 rounded-lg p-4">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-400">Tasks</span>
                    <span className="rounded-full bg-blue-500/20 px-2 py-1 text-xs font-bold text-blue-400">
                        {dataset?.tasks?.total_tasks || 0}
                    </span>
                </div>
                <div className="line-clamp-2 text-sm text-slate-300" title={firstTask}>
                    {firstTask || 'No tasks available'}
                </div>
            </div>

            {/* Episodes & Size Row */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-725 rounded-lg p-4">
                    <div className="text-sm font-medium text-slate-400">Episodes</div>
                    <div className="mt-1 text-2xl font-bold text-slate-200">{dataset?.episodes || 0}</div>
                </div>
                <div className="bg-slate-725 rounded-lg p-4">
                    <div className="text-sm font-medium text-slate-400">Size</div>
                    <div className="mt-1 text-lg font-semibold text-slate-200">{size}</div>
                </div>
            </div>
        </div>
    );
};
