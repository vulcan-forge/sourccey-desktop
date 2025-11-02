import { useGetAllTrainingLogs } from '@/hooks/Components/Log/training-log.hook';
import { useState, useEffect, useRef, useMemo } from 'react';
import { FaBrain, FaChevronDown, FaChevronUp, FaSearch, FaFilter } from 'react-icons/fa';

export const TrainingLogs = () => {
    const { data: logs }: any = useGetAllTrainingLogs();
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
    const logsRef = useRef<{ [key: string]: string[] }>({});

    // Update logs ref when logs change
    useEffect(() => {
        if (logs) {
            logsRef.current = logs;
        }
    }, [logs]);

    // Filter logs based on search term
    const filteredLogs = useMemo(() => {
        if (!logs) return {};

        const filtered: { [key: string]: string[] } = {};

        Object.keys(logs).forEach((model) => {
            const modelLogs = logs[model] || [];

            if (!searchTerm) {
                filtered[model] = modelLogs;
            } else {
                const searchLower = searchTerm.toLowerCase();
                const filteredModelLogs = modelLogs.filter(
                    (log: string) => log.toLowerCase().includes(searchLower) || model.toLowerCase().includes(searchLower)
                );

                if (filteredModelLogs.length > 0) {
                    filtered[model] = filteredModelLogs;
                }
            }
        });

        return filtered;
    }, [logs, searchTerm]);

    // Get all models that have logs
    const availableModels = useMemo(() => {
        return Object.keys(filteredLogs).sort();
    }, [filteredLogs]);

    // Toggle model expansion
    const toggleModel = (model: string) => {
        setExpandedModels((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(model)) {
                newSet.delete(model);
            } else {
                newSet.add(model);
            }
            return newSet;
        });
    };

    // Expand all models
    const expandAll = () => {
        setExpandedModels(new Set(availableModels));
    };

    // Collapse all models
    const collapseAll = () => {
        setExpandedModels(new Set());
    };

    // Clear search
    const clearSearch = () => {
        setSearchTerm('');
    };

    return (
        <div className="space-y-4">
            {/* Header with search and controls */}
            <div className="bg-slate-825 rounded-xl border-2 border-slate-700 p-6 backdrop-blur-sm">
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-white">Training Logs</h1>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={expandAll}
                            className="hover:bg-slate-650 cursor-pointer rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white transition-all"
                        >
                            Expand All
                        </button>
                        <button
                            onClick={collapseAll}
                            className="hover:bg-slate-650 cursor-pointer rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white transition-all"
                        >
                            Collapse All
                        </button>
                    </div>
                </div>

                {/* Search bar */}
                <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                        <FaSearch className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search logs by model name or content..."
                        className="hover:bg-slate-650 w-full rounded-lg bg-slate-700 py-3 pr-12 pl-12 text-white placeholder-slate-400 transition-all duration-200 focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            onClick={clearSearch}
                            className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 hover:text-white"
                        >
                            <FaFilter className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Stats */}
                <div className="mt-4 flex items-center gap-6 text-sm text-slate-400">
                    <span>Models: {availableModels.length}</span>
                    <span>Total Logs: {Object.values(filteredLogs).reduce((sum, logs) => sum + logs.length, 0)}</span>
                    {searchTerm && <span className="text-blue-400">Filtered by: &quot;{searchTerm}&quot;</span>}
                </div>
            </div>

            {/* Logs list */}
            {availableModels.length > 0 ? (
                <div className="space-y-4">
                    {availableModels.map((model) => (
                        <TrainingLog
                            key={model}
                            model={model}
                            logs={filteredLogs[model] || []}
                            isExpanded={expandedModels.has(model)}
                            onToggle={() => toggleModel(model)}
                            searchTerm={searchTerm}
                        />
                    ))}
                </div>
            ) : (
                <div className="bg-slate-825 rounded-xl border-2 border-slate-700 p-8 text-center backdrop-blur-sm">
                    <FaBrain className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                    <h3 className="mb-2 text-lg font-semibold text-slate-400">{searchTerm ? 'No logs found' : 'No training logs available'}</h3>
                    <p className="text-sm text-slate-500">
                        {searchTerm ? `No logs match your search for "${searchTerm}"` : 'Start training a model to see logs here'}
                    </p>
                    {searchTerm && (
                        <button
                            onClick={clearSearch}
                            className="mt-4 cursor-pointer rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-slate-600"
                        >
                            Clear Search
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export const TrainingLog = ({
    model,
    logs,
    isExpanded,
    onToggle,
    searchTerm = '',
}: {
    model: string;
    logs: string[];
    isExpanded: boolean;
    onToggle: () => void;
    searchTerm?: string;
}) => {
    const [displayLogs, setDisplayLogs] = useState<string[]>([]);
    const logsRef = useRef<string[]>([]);

    // Update logs when they change
    useEffect(() => {
        if (logs && Array.isArray(logs)) {
            logsRef.current = logs;
            setDisplayLogs(isExpanded ? logs : logs.slice(-100)); // Show last 100 or all
        }
    }, [logs, isExpanded]);

    // Highlight search terms in logs
    const highlightSearchTerm = (text: string, term: string) => {
        if (!term) return text;

        const regex = new RegExp(`(${term})`, 'gi');
        const parts = text.split(regex);

        return parts.map((part, index) =>
            regex.test(part) ? (
                <mark key={index} className="rounded bg-yellow-200 px-1 text-slate-900">
                    {part}
                </mark>
            ) : (
                part
            )
        );
    };

    return (
        <div className="bg-slate-825 overflow-hidden rounded-xl border-2 border-slate-700 backdrop-blur-sm">
            <div className="bg-slate-825 flex items-center justify-between border-b border-slate-700 p-4">
                <div className="flex items-center gap-3">
                    <FaBrain className="h-5 w-5 text-slate-400" />
                    <h3 className="text-lg font-semibold text-white">Training Logs - {model}</h3>
                    <div className="flex items-center gap-2">
                        {logs.length > 0 ? (
                            <>
                                <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                                <span className="text-sm text-slate-400">Live</span>
                            </>
                        ) : (
                            <>
                                <div className="h-2 w-2 rounded-full bg-slate-400" />
                                <span className="text-sm text-slate-400">Training</span>
                            </>
                        )}
                    </div>
                    {searchTerm && (
                        <span className="rounded-full bg-yellow-600/20 px-2 py-1 text-xs text-yellow-400">{logs.length} matches</span>
                    )}
                </div>
                <button
                    onClick={onToggle}
                    className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-slate-700/60"
                >
                    {isExpanded ? (
                        <>
                            <FaChevronUp className="h-4 w-4" />
                            Hide
                        </>
                    ) : (
                        <>
                            <FaChevronDown className="h-4 w-4" />
                            Show
                        </>
                    )}
                </button>
            </div>

            {isExpanded && (
                <>
                    <div className="scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 h-[500px] overflow-y-auto bg-slate-900/50 font-mono">
                        <div className="space-y-0.5 p-4">
                            {displayLogs.length > 0 ? (
                                displayLogs.map((log, index) => (
                                    <div key={index} className="text-xs leading-relaxed text-slate-400">
                                        {searchTerm ? highlightSearchTerm(log, searchTerm) : log}
                                    </div>
                                ))
                            ) : (
                                <div className="text-sm text-slate-400">
                                    {logs.length > 0 ? 'Waiting for training logs...' : `No training logs available for ${model}`}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-slate-700 bg-slate-800 p-3">
                        <div className="flex items-center justify-between font-mono text-xs text-slate-400">
                            <span>ENTRIES: {displayLogs.length}</span>
                            <span>MODEL: {model}</span>
                            {!isExpanded && logs.length > 100 && <span className="text-yellow-400">Showing last 100 of {logs.length}</span>}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
