import type {
    CommandLog as CommandLogType,
    CommandLogFilters as CommandLogFiltersType,
    CommandLogSort as CommandLogSortType,
} from '@/types/Models/command-log';
import { FaSpinner, FaHistory, FaPlay, FaCheck, FaTimes, FaClock, FaRobot, FaCopy } from 'react-icons/fa';
import InfiniteScroll from 'react-infinite-scroller';
import { CommandLogFilters } from '@/components/Elements/Log/CommandLogFilters';
import { CommandLogSort } from '@/components/Elements/Log/CommandLogSort';
import { toast } from 'react-toastify';
import { toastSuccessDefaults, toastErrorDefaults } from '@/utils/toast/toast-utils';
import { extractScriptName } from '@/utils/logs/command-logs/command-logs';
import { queryClient } from '@/hooks/default';
import { BASE_COMMAND_LOG_KEY } from '@/hooks/Components/Log/command-log.hook';
import { deleteAllCommandLogs } from '@/api/Local/Log/command-logs';
import { useState } from 'react';
import { Spinner } from '@/components/Elements/Spinner';

export const CommandLogs = ({
    commands,
    isLoading,
    fetchNextPage,
    hasNextPage,
    totalCount,
    currentPage,
    totalPages,
    error,
    filters,
    setFilters,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
}: {
    commands: CommandLogType[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    totalCount: number;
    currentPage: number;
    totalPages: number;
    error: any;
    filters: CommandLogFiltersType;
    setFilters: (filters: CommandLogFiltersType) => void;
    sortBy: string;
    setSortBy: (field: string) => void;
    sortOrder: 'asc' | 'desc';
    setSortOrder: (order: 'asc' | 'desc') => void;
}) => {
    return (
        <div className="rounded-xl border-2 border-slate-700/50 bg-slate-800 p-3 backdrop-blur-sm sm:p-6">
            <CommandLogRaw
                commands={commands}
                isLoading={isLoading}
                fetchNextPage={fetchNextPage}
                hasNextPage={hasNextPage}
                totalCount={totalCount}
                currentPage={currentPage}
                totalPages={totalPages}
                error={error}
                filters={filters}
                setFilters={setFilters}
                sortBy={sortBy}
                setSortBy={setSortBy}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
            />
        </div>
    );
};

export const CommandLogRaw = ({
    commands,
    isLoading,
    fetchNextPage,
    hasNextPage,
    totalCount,
    currentPage,
    totalPages,
    error,
    filters,
    setFilters,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
}: {
    commands: CommandLogType[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    totalCount: number;
    currentPage: number;
    totalPages: number;
    error: any;
    filters: CommandLogFiltersType;
    setFilters: (filters: CommandLogFiltersType) => void;
    sortBy: string;
    setSortBy: (field: string) => void;
    sortOrder: 'asc' | 'desc';
    setSortOrder: (order: 'asc' | 'desc') => void;
}) => {
    if (isLoading && commands.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <FaSpinner className="h-8 w-8 animate-spin text-blue-500" />
                <span className="ml-3 text-slate-300">Loading command history...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="py-8 text-center">
                <div className="mb-2 text-red-400">Error loading command history</div>
                <div className="text-sm text-slate-400">{error.message}</div>
            </div>
        );
    }

    if (commands.length === 0) {
        return (
            <div className="flex flex-col py-8 text-center">
                <FaHistory className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                <h3 className="mb-2 text-lg font-medium text-slate-300">No command history found</h3>
                <p className="text-slate-400">Commands you run will appear here</p>
            </div>
        );
    }

    return (
        <div>
            <CommandLogHeader
                totalCount={totalCount}
                currentPage={currentPage}
                totalPages={totalPages}
                filters={filters}
                setFilters={setFilters}
                sortBy={sortBy}
                setSortBy={setSortBy}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
            />
            <CommandLogContainer commands={commands} isLoading={isLoading} fetchNextPage={fetchNextPage} hasNextPage={hasNextPage} />
        </div>
    );
};

const CommandLogHeader = ({
    totalCount,
    currentPage,
    totalPages,
    filters,
    setFilters,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
}: {
    totalCount: number;
    currentPage: number;
    totalPages: number;
    filters: CommandLogFiltersType;
    setFilters: (filters: CommandLogFiltersType) => void;
    sortBy: string;
    setSortBy: (field: string) => void;
    sortOrder: 'asc' | 'desc';
    setSortOrder: (order: 'asc' | 'desc') => void;
}) => {
    const [isClearingLogs, setIsClearingLogs] = useState(false);
    const onClearLogs = async () => {
        try {
            setIsClearingLogs(true);
            await deleteAllCommandLogs();
            queryClient.invalidateQueries({ queryKey: [BASE_COMMAND_LOG_KEY, 'infinite'] });
            setIsClearingLogs(false);

            toast.success('Logs cleared', {
                ...toastSuccessDefaults,
            });
        } catch (error) {
            setIsClearingLogs(false);
            toast.error('Failed to clear logs', {
                ...toastErrorDefaults,
            });
        }
    };

    return (
        <div className="mb-6">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-white">Command History</h2>
                    <p className="text-sm text-slate-400">
                        {totalCount} command{totalCount !== 1 ? 's' : ''} • Page {currentPage} of {totalPages}
                    </p>
                </div>
                <div className="flex gap-2">
                    <CommandLogFilters filters={filters} setFilters={setFilters} />
                    <CommandLogSort sortBy={sortBy} setSortBy={setSortBy} sortOrder={sortOrder} setSortOrder={setSortOrder} />

                    {/* Divider */}
                    <div className="mx-2 h-8 w-px bg-slate-600"></div>

                    <div className="ml-2">
                        <button
                            onClick={onClearLogs}
                            className="flex h-8 w-24 cursor-pointer items-center justify-center rounded-md border border-red-500/30 text-sm font-medium text-red-400 transition-colors duration-200 hover:bg-red-900/50 hover:text-red-300"
                            disabled={isClearingLogs}
                        >
                            {isClearingLogs ? <Spinner color="red" /> : 'Clear Logs'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CommandLogContainer = ({
    commands,
    isLoading,
    fetchNextPage,
    hasNextPage,
}: {
    commands: CommandLogType[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
}) => {
    return (
        <div className="flex h-128 flex-col">
            <div className="hidden h-full lg:block">
                <CommandLogRowContainer commands={commands} isLoading={isLoading} fetchNextPage={fetchNextPage} hasNextPage={hasNextPage} />
            </div>

            <div className="block h-full overflow-y-auto lg:hidden">
                <CommandLogGridContainer commands={commands} isLoading={isLoading} fetchNextPage={fetchNextPage} hasNextPage={hasNextPage} />
            </div>
        </div>
    );
};

const CommandLogRowContainer = ({
    commands,
    isLoading,
    fetchNextPage,
    hasNextPage,
}: {
    commands: CommandLogType[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
}) => {
    return (
        <div className="flex h-full w-full flex-col overflow-x-auto">
            <div className="scrollbar-left h-full w-full min-w-[1040px] overflow-y-scroll pr-4">
                <div className="sticky top-0 z-10 flex w-full gap-6 border-b border-slate-700/50 bg-slate-800 pb-4 backdrop-blur-sm">
                    <div className="flex w-40 flex-none items-center pl-4 text-sm font-medium text-slate-400">Command</div>
                    <div className="flex w-32 flex-none items-center text-sm font-medium text-slate-400">Robot</div>
                    <div className="flex w-32 flex-none items-center text-sm font-medium text-slate-400">Status</div>
                    <div className="flex w-32 flex-none items-center text-sm font-medium text-slate-400">Duration</div>
                    <div className="flex w-48 flex-none items-center text-sm font-medium text-slate-400">Started</div>
                    <div className="flex w-48 flex-none items-center text-sm font-medium text-slate-400">Completed</div>
                </div>

                {!isLoading && (
                    <InfiniteScroll
                        className="flex flex-col divide-y divide-slate-700/50"
                        loadMore={fetchNextPage}
                        hasMore={hasNextPage}
                        loader={
                            <div key={0} className="flex h-16 w-full items-center justify-center py-4">
                                <FaSpinner className="h-6 w-6 animate-spin text-blue-500" />
                                <span className="ml-2 text-sm text-slate-400">Loading more commands...</span>
                            </div>
                        }
                        useWindow={false}
                    >
                        {commands.map((command: CommandLogType) => (
                            <CommandLogRowItem key={command.id} command={command} />
                        ))}
                    </InfiniteScroll>
                )}
            </div>
        </div>
    );
};

const CommandLogRowItem = ({ command }: { command: CommandLogType }) => {
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success':
                return <FaCheck className="h-4 w-4 text-green-500" />;
            case 'failed':
                return <FaTimes className="h-4 w-4 text-red-500" />;
            case 'running':
                return <FaPlay className="h-4 w-4 text-blue-500" />;
            case 'cancelled':
                return <FaTimes className="h-4 w-4 text-yellow-500" />;
            default:
                return <FaClock className="h-4 w-4 text-slate-500" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'success':
                return 'text-green-400';
            case 'failed':
                return 'text-red-400';
            case 'running':
                return 'text-blue-400';
            case 'cancelled':
                return 'text-yellow-400';
            default:
                return 'text-slate-400';
        }
    };

    const formatDuration = (ms?: number) => {
        if (!ms) return '-';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString();
    };

    const copyCommand = async () => {
        try {
            await navigator.clipboard.writeText(command.command);
            toast.success('Command copied to clipboard', {
                ...toastSuccessDefaults,
            });
        } catch (err) {
            console.error('Failed to copy command:', err);
            toast.error('Failed to copy command', {
                ...toastErrorDefaults,
            });
        }
    };

    const robotName = command.owned_robot?.nickname || command.robot?.name || 'Unknown';
    const extractedScriptName = extractScriptName(command.command);
    const trimmedScriptName = extractedScriptName.length > 20 ? extractedScriptName.slice(0, 20) + '...' : extractedScriptName;

    return (
        <div className="flex w-full gap-6 py-4 transition-colors hover:bg-slate-700/30">
            <div className="flex w-40 flex-none items-center pl-4">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium text-white" title={trimmedScriptName}>
                            {trimmedScriptName}
                        </div>
                        <button
                            onClick={copyCommand}
                            className="flex-shrink-0 cursor-pointer rounded p-1.5 text-slate-400 transition-all duration-200 hover:bg-slate-600 hover:text-white active:bg-slate-500"
                            title="Copy command"
                        >
                            <FaCopy className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    {command.description && (
                        <div className="truncate text-xs text-slate-400" title={command.description}>
                            {command.description}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex w-32 flex-none items-center">
                <div className="flex items-center gap-2">
                    <FaRobot className="h-4 w-4 text-slate-500" />
                    <span className="truncate text-sm text-slate-300" title={robotName}>
                        {robotName}
                    </span>
                </div>
            </div>

            <div className="flex w-32 flex-none items-center">
                <div className="flex items-center gap-2">
                    {getStatusIcon(command.status)}
                    <span className={`text-sm font-medium ${getStatusColor(command.status)}`}>{command.status}</span>
                </div>
            </div>

            <div className="flex w-32 flex-none items-center">
                <span className="text-sm text-slate-300">{formatDuration(command.execution_time_ms)}</span>
            </div>

            <div className="flex w-48 flex-none items-center">
                <span className="text-sm text-slate-300">{formatDate(command.started_at)}</span>
            </div>

            <div className="flex w-48 flex-none items-center">
                <span className="text-sm text-slate-300">{formatDate(command.completed_at)}</span>
            </div>
        </div>
    );
};

const CommandLogGridContainer = ({
    commands,
    isLoading,
    fetchNextPage,
    hasNextPage,
}: {
    commands: CommandLogType[];
    isLoading: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
}) => {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {!isLoading && (
                <InfiniteScroll
                    className="contents"
                    loadMore={fetchNextPage}
                    hasMore={hasNextPage}
                    loader={
                        <div key={0} className="col-span-full flex h-16 w-full items-center justify-center py-4">
                            <FaSpinner className="h-6 w-6 animate-spin text-blue-500" />
                            <span className="ml-2 text-sm text-slate-400">Loading more commands...</span>
                        </div>
                    }
                    useWindow={false}
                >
                    {commands.map((command: CommandLogType) => (
                        <CommandLogGridItem key={command.id} command={command} />
                    ))}
                </InfiniteScroll>
            )}
        </div>
    );
};

const CommandLogGridItem = ({ command }: { command: CommandLogType }) => {
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success':
                return <FaCheck className="h-4 w-4 text-green-500" />;
            case 'failed':
                return <FaTimes className="h-4 w-4 text-red-500" />;
            case 'running':
                return <FaPlay className="h-4 w-4 text-blue-500" />;
            case 'cancelled':
                return <FaTimes className="h-4 w-4 text-yellow-500" />;
            default:
                return <FaClock className="h-4 w-4 text-slate-500" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'success':
                return 'text-green-400';
            case 'failed':
                return 'text-red-400';
            case 'running':
                return 'text-blue-400';
            case 'cancelled':
                return 'text-yellow-400';
            default:
                return 'text-slate-400';
        }
    };

    const formatDuration = (ms?: number) => {
        if (!ms) return '-';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    };

    const copyCommand = async () => {
        try {
            await navigator.clipboard.writeText(command.command);
            toast.success('Command copied to clipboard', {
                ...toastSuccessDefaults,
            });
        } catch (err) {
            console.error('Failed to copy command:', err);
            toast.error('Failed to copy command', {
                ...toastErrorDefaults,
            });
        }
    };

    const robotName = command.owned_robot?.nickname || command.robot?.name || 'Unknown';

    return (
        <div className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 p-4 transition-colors hover:bg-slate-700">
            <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2">
                    <FaRobot className="h-3 w-3 text-slate-500" />
                    <span className="truncate text-xs text-slate-400" title={robotName}>
                        {robotName}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {getStatusIcon(command.status)}
                    <span className={`text-sm font-medium ${getStatusColor(command.status)}`}>{command.status}</span>
                </div>
            </div>

            <div className="mb-3">
                <div className="mb-1 flex items-center gap-2">
                    <div className="truncate text-sm font-medium text-white" title={command.command}>
                        {command.command}
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            copyCommand();
                        }}
                        className="flex-shrink-0 cursor-pointer rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-600 hover:text-white"
                        title="Copy command"
                    >
                        <FaCopy className="h-3.5 w-3.5" />
                    </button>
                </div>
                {command.description && (
                    <div className="truncate text-xs text-slate-400" title={command.description}>
                        {command.description}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Exit: {command.exit_code !== undefined ? command.exit_code : '-'}</span>
                <span>{formatDuration(command.execution_time_ms)}</span>
            </div>
        </div>
    );
};
