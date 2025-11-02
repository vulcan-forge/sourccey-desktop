import { setSelectedAIModel, useGetSelectedAIModel } from '@/hooks/Components/AI/AIModels/ai-model.hook';
import { setContent } from '@/hooks/Components/OwnedRobots/owned-robots.hook';
import type { AIModel } from '@/types/Module/AIModels/ai-model';
import { estimateModelParameters, formatParameterCount } from '@/utils/ai/parameters';
import { useEffect, useState } from 'react';
import { FaSpinner, FaBrain, FaCog, FaFolder, FaBolt, FaDatabase } from 'react-icons/fa';
import InfiniteScroll from 'react-infinite-scroller';
import { Tooltip } from 'react-tooltip';

export const AIModels = ({
    models,
    isLoading,
    fetchNextPage,
    hasNextPage,
    totalCount,
    currentPage,
    totalPages,
    nickname,
    error,
}: {
    models: AIModel[];
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
        <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-4 backdrop-blur-sm">
            <AIModelsRaw
                models={models}
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

export const AIModelsRaw = ({
    models,
    isLoading,
    fetchNextPage,
    hasNextPage,
    totalCount,
    currentPage,
    totalPages,
    nickname,
    error,
}: {
    models: AIModel[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    totalCount: number;
    currentPage: number;
    totalPages: number;
    nickname: string | null;
    error: any;
}) => {
    const [hasInitialized, setHasInitialized] = useState(false);

    const { data: selectedModel = null }: any = useGetSelectedAIModel();
    useEffect(() => {
        if (!isLoading && models.length > 0 && !hasInitialized) {
            setSelectedAIModel(models[0] as AIModel);
            setHasInitialized(true);
        }
    }, [isLoading, models, hasInitialized]);

    const handleModelClick = (model: AIModel) => {
        if (selectedModel?.path === model.path) {
            setSelectedAIModel(null);
        } else {
            setSelectedAIModel(model);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-72 items-center justify-center py-12">
                <FaSpinner className="h-8 w-8 animate-spin text-blue-500" />
                <span className="ml-3 text-slate-300">Loading AI models...</span>
            </div>
        );
    }

    if (error) {
        console.error(error);
        return (
            <div className="flex h-72 flex-col py-8 text-center">
                <div className="mb-2 text-red-400">Error loading AI models</div>
                <div className="text-sm text-slate-400">{error.message}</div>
            </div>
        );
    }

    if (models.length === 0) {
        const message = nickname ? `No AI models found for "${nickname}" in the lerobot cache directory.` : 'No AI models found.';
        return (
            <div className="flex h-72 flex-col py-8 text-center">
                <FaBrain className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                <h3 className="mb-2 text-lg font-medium text-slate-300">No AI models found</h3>
                <p className="text-slate-400">{message}</p>
            </div>
        );
    }

    return (
        <div>
            <AIModelsHeader totalCount={totalCount} currentPage={currentPage} totalPages={totalPages} />
            <AIModelsContainer
                models={models}
                isLoading={isLoading}
                fetchNextPage={fetchNextPage}
                hasNextPage={hasNextPage}
                selectedModel={selectedModel}
                onSelect={handleModelClick}
            />
        </div>
    );
};

const AIModelsHeader = ({ totalCount, currentPage, totalPages }: { totalCount: number; currentPage: number; totalPages: number }) => {
    return (
        <div className="mb-4 flex items-center justify-between border-b-2 border-slate-700 pb-4">
            <div>
                <h2 className="text-xl font-semibold text-white">AI Models</h2>
            </div>
            <button
                onClick={() => setContent('training')}
                className="hover:bg-slate-675 inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-slate-700 px-3 text-sm font-medium text-slate-300 transition-all hover:text-white"
            >
                <FaCog className="h-4 w-4" />
                Train New Model
            </button>
        </div>
    );
};

const AIModelsContainer = ({
    models,
    isLoading,
    fetchNextPage,
    hasNextPage,
    selectedModel,
    onSelect,
}: {
    models: AIModel[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    selectedModel: AIModel | null;
    onSelect: (model: AIModel) => void;
}) => {
    return (
        <div className="flex h-128 flex-col">
            <div className="hidden h-full lg:block">
                <AIModelsRowContainer
                    models={models}
                    isLoading={isLoading}
                    fetchNextPage={fetchNextPage}
                    hasNextPage={hasNextPage}
                    selectedModel={selectedModel}
                    onSelect={onSelect}
                />
            </div>

            <div className="block h-full overflow-y-auto lg:hidden">
                <AIModelsGridContainer
                    models={models}
                    isLoading={isLoading}
                    fetchNextPage={fetchNextPage}
                    hasNextPage={hasNextPage}
                    selectedModel={selectedModel}
                    onSelect={onSelect}
                />
            </div>
        </div>
    );
};

const AIModelsRowContainer = ({
    models,
    isLoading,
    fetchNextPage,
    hasNextPage,
    selectedModel,
    onSelect,
}: {
    models: AIModel[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    selectedModel: AIModel | null;
    onSelect: (model: AIModel) => void;
}) => {
    return (
        <div className="flex h-full w-full flex-col overflow-x-auto pb-2">
            <div className="scrollbar-left h-full w-full min-w-[1400px] overflow-y-scroll pr-4 pl-2">
                <div className="sticky top-0 z-10 flex w-full gap-6 bg-slate-800 pb-4 backdrop-blur-sm">
                    <div className="flex w-64 flex-none items-center pl-4 text-sm font-medium text-slate-400">Model</div>
                    <div className="flex w-24 flex-none items-center text-sm font-medium text-slate-400">Policy Type</div>
                    <div className="flex w-80 flex-none items-center text-sm font-medium text-slate-400">Dataset</div>
                    <div className="flex w-24 flex-none items-center text-sm font-medium text-slate-400">Parameters</div>
                    <div className="flex w-24 flex-none items-center text-sm font-medium text-slate-400">Episodes</div>
                    <div className="flex w-24 flex-none items-center text-sm font-medium text-slate-400">Steps</div>
                    <div className="flex w-24 flex-none items-center text-sm font-medium text-slate-400">Batch Size</div>
                    <div className="flex w-24 flex-none items-center text-sm font-medium text-slate-400">Samples</div>
                </div>

                {/* Data Content */}
                {!isLoading && (
                    <InfiniteScroll
                        className="flex flex-col"
                        loadMore={fetchNextPage}
                        hasMore={hasNextPage}
                        loader={
                            <div key={0} className="flex h-16 w-full items-center justify-center py-4">
                                <FaSpinner className="h-6 w-6 animate-spin text-blue-500" />
                                <span className="ml-2 text-sm text-slate-400">Loading more models...</span>
                            </div>
                        }
                        useWindow={false}
                    >
                        {models.map((model: AIModel) => (
                            <AIModelsRowItem
                                key={model.path}
                                model={model}
                                selected={selectedModel?.path === model?.path}
                                onSelect={onSelect}
                            />
                        ))}
                    </InfiniteScroll>
                )}
            </div>
        </div>
    );
};

const AIModelsRowItem = ({ model, selected, onSelect }: { model: AIModel; selected: boolean; onSelect: (model: AIModel) => void }) => {
    // Calculate estimated parameters
    const estimatedParams = model.training_config ? estimateModelParameters(model.training_config) : 0;
    const formattedParams = formatParameterCount(estimatedParams);

    const datasetFile = model?.training_config?.dataset?.repo_id;
    const policyType = model?.training_config?.policy?.type;
    const episodes = model?.episodes || 0;
    const steps = model?.training_config?.steps || 0;
    const batchSize = model?.training_config?.batch_size || 0;
    const samples = steps * batchSize;

    return (
        <div className={`group flex w-full cursor-pointer pb-2`} onClick={() => onSelect(model)}>
            <div className={`flex cursor-pointer gap-6 rounded-xl py-4 transition-colors ${selected ? 'bg-slate-700' : 'hover:bg-slate-725'}`}>
                <div className="flex w-64 min-w-0 flex-none items-center gap-3 py-4 pl-4">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-green-500/20">
                        <FaBrain className="h-4 w-4 text-green-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div
                            className="line-clamp-2 cursor-pointer font-medium text-white"
                            data-tooltip-id={`model-${model.name}`}
                            data-tooltip-content={model.name}
                        >
                            {model.name}
                        </div>
                        <Tooltip
                            id={`model-${model.name}`}
                            place="top"
                            className="max-w-xs"
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
                <div className="flex w-24 flex-none flex-shrink-0 items-center justify-start py-4">
                    <div className="inline-flex items-center rounded-full bg-green-600/50 px-3 py-1 text-sm font-medium text-slate-300">
                        {policyType || 'unknown'}
                    </div>
                </div>
                <div className="flex w-80 min-w-0 flex-none items-center py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-blue-500/20">
                            <FaDatabase className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="line-clamp-2 min-w-0 flex-1 text-sm text-slate-300">{datasetFile}</div>
                    </div>
                </div>
                <div className="flex w-24 flex-none flex-shrink-0 items-center py-4">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-yellow-500/30">
                            <FaBolt className="h-4 w-4 text-yellow-500" />
                        </div>
                        <span className="text-md font-medium text-slate-300">{formattedParams}</span>
                    </div>
                </div>
                <div className="flex w-24 flex-none flex-shrink-0 items-center justify-start py-4">
                    <div className="text-md font-medium text-slate-300">{episodes.toLocaleString()}</div>
                </div>
                <div className="flex w-24 flex-none flex-shrink-0 items-center justify-start py-4">
                    <div className="text-md font-medium text-slate-300">{steps.toLocaleString()}</div>
                </div>
                <div className="flex w-24 flex-none flex-shrink-0 items-center justify-start py-4">
                    <div className="text-md font-medium text-slate-300">{batchSize.toLocaleString()}</div>
                </div>
                <div className="flex w-24 flex-none flex-shrink-0 items-center justify-start py-4">
                    <div className="text-md font-medium text-slate-300">{samples.toLocaleString()}</div>
                </div>
            </div>
        </div>
    );
};

const AIModelsGridContainer = ({
    models,
    isLoading,
    fetchNextPage,
    hasNextPage,
    selectedModel,
    onSelect,
}: {
    models: AIModel[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    selectedModel: AIModel | null;
    onSelect: (model: AIModel) => void;
}) => {
    return (
        <div className="h-full w-full overflow-y-auto pr-2">
            {!isLoading && (
                <InfiniteScroll
                    className="flex w-full flex-col"
                    loadMore={fetchNextPage}
                    hasMore={hasNextPage}
                    loader={
                        <div key={0} className="flex h-16 w-full items-center justify-center py-4">
                            <FaSpinner className="h-6 w-6 animate-spin text-blue-500" />
                            <span className="ml-2 text-sm text-slate-400">Loading more models...</span>
                        </div>
                    }
                    useWindow={false}
                    threshold={100}
                >
                    <div className="grid gap-6 sm:grid-cols-1">
                        {models.map((model: AIModel) => (
                            <AIModelsGridItem key={model.path} model={model} selected={selectedModel === model} onSelect={onSelect} />
                        ))}
                    </div>
                </InfiniteScroll>
            )}
        </div>
    );
};

const AIModelsGridItem = ({ model, selected, onSelect }: { model: AIModel; selected: boolean; onSelect: (model: AIModel) => void }) => {
    // Calculate estimated parameters
    const estimatedParams = model.training_config ? estimateModelParameters(model.training_config) : 0;
    const formattedParams = formatParameterCount(estimatedParams);

    const datasetFile = model?.training_config?.dataset?.repo_id;
    const policyType = model?.training_config?.policy?.type;
    const episodes = model?.episodes || 0;
    const steps = model?.training_config?.steps || 0;
    const batchSize = model?.training_config?.batch_size || 0;
    const samples = steps * batchSize;

    return (
        <div
            className={`group relative flex h-full cursor-pointer flex-col gap-4 rounded-xl border border-slate-700/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-6 transition-all duration-200 hover:border-slate-600/50 hover:bg-gradient-to-br hover:from-slate-700/50 hover:to-slate-800/50 hover:shadow-lg hover:shadow-slate-900/20 ${
                selected ? 'border-slate-600/50 bg-gradient-to-br from-slate-700/50 to-slate-800/50 shadow-lg shadow-slate-900/20' : ''
            }`}
            onClick={() => onSelect(model)}
        >
            {/* Model Header */}
            <div className="flex items-center gap-4 rounded-lg bg-slate-700/50 p-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 shadow-lg group-hover:from-blue-500/30 group-hover:to-blue-600/30">
                    <FaBrain className="h-6 w-6 text-blue-400" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col items-center">
                    <div
                        className="line-clamp-2 cursor-pointer text-lg font-semibold text-white group-hover:text-blue-100"
                        data-tooltip-id={`model-grid-${model.name}`}
                        data-tooltip-content={model.name}
                    >
                        {model.name}
                    </div>
                </div>
            </div>

            {/* Model Type Section */}
            <div className="rounded-lg bg-slate-700/50 p-4">
                <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-400">Policy Type</div>
                <div className="text-2xl font-medium text-slate-300">{policyType || 'unknown'}</div>
            </div>

            {/* Checkpoints & Status Row */}
            <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-slate-700/50 p-4">
                    <div className="text-sm font-medium text-slate-400">Episodes</div>
                    <div className="mt-1 text-2xl font-bold text-slate-200">{episodes.toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-slate-700/50 p-4">
                    <div className="text-sm font-medium text-slate-400">Batch Size</div>
                    <div className="mt-1 text-2xl font-bold text-slate-200">{batchSize.toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-slate-700/50 p-4">
                    <div className="text-sm font-medium text-slate-400">Steps</div>
                    <div className="mt-1 text-2xl font-bold text-slate-200">{steps.toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-slate-700/50 p-4">
                    <div className="text-sm font-medium text-slate-400">Samples</div>
                    <div className="mt-1 text-2xl font-bold text-slate-200">{samples.toLocaleString()}</div>
                </div>
            </div>

            {/* Parameters Section */}
            <div className="rounded-lg bg-slate-700/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-400">Parameters (approx.)</span>
                    <span className="text-sm font-medium text-slate-300">{formattedParams}</span>
                </div>
            </div>

            {/* Path Section */}
            <div className="rounded-lg bg-slate-700/50 p-4">
                <div className="mb-3 text-sm font-medium text-slate-400">Dataset</div>
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-slate-600/50">
                        <FaFolder className="h-3 w-3 text-slate-400" />
                    </div>
                    <div className="line-clamp-2 min-w-0 flex-1 text-sm text-slate-300">{datasetFile}</div>
                </div>
            </div>
        </div>
    );
};
