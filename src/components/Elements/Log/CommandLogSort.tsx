import { FaSort, FaSortUp, FaSortDown } from 'react-icons/fa';
import { useState } from 'react';
import type { CommandLogSort as CommandLogSortType } from '@/types/Models/command-log';

export const CommandLogSort = ({
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
}: {
    sortBy: string;
    setSortBy: (field: string) => void;
    sortOrder: 'asc' | 'desc';
    setSortOrder: (order: 'asc' | 'desc') => void;
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const sortOptions = [
        { value: 'started_at', label: 'Started Date' },
        { value: 'completed_at', label: 'Completed Date' },
        { value: 'command', label: 'Command' },
        { value: 'status', label: 'Status' },
        { value: 'execution_time_ms', label: 'Duration' },
        { value: 'exit_code', label: 'Exit Code' },
    ];

    const getSortIcon = (field: string) => {
        if (sortBy !== field) return <FaSort className="h-3 w-3 text-slate-500" />;
        return sortOrder === 'asc' ? <FaSortUp className="h-3 w-3 text-blue-500" /> : <FaSortDown className="h-3 w-3 text-blue-500" />;
    };

    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('desc');
        }
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-700/50 px-3 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-slate-700/70 hover:text-white"
            >
                <FaSort className="h-4 w-4" />
                Sort
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 z-50 mt-2 w-48 rounded-lg border border-slate-700/50 bg-slate-800 p-2 shadow-lg">
                    {sortOptions.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => handleSort(option.value)}
                            className="flex w-full items-center justify-between rounded px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white"
                        >
                            <span>{option.label}</span>
                            {getSortIcon(option.value)}
                        </button>
                    ))}
                </div>
            )}

            {/* Click outside to close */}
            {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
        </div>
    );
};
