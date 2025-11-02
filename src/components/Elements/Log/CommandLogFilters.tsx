import { FaFilter, FaTimes } from 'react-icons/fa';
import { useState } from 'react';
import type { CommandLogFilters as CommandLogFiltersType } from '@/types/Models/command-log';

export const CommandLogFilters = ({
    filters,
    setFilters,
}: {
    filters: CommandLogFiltersType;
    setFilters: (filters: CommandLogFiltersType) => void;
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const clearFilters = () => {
        setFilters({
            status: '',
            robot_id: '',
            command: '',
        });
    };

    const hasActiveFilters = filters.status || filters.robot_id || filters.command;

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    hasActiveFilters
                        ? 'bg-blue-600/50 text-white hover:bg-blue-600/70'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70 hover:text-white'
                }`}
            >
                <FaFilter className="h-4 w-4" />
                Filters
                {hasActiveFilters && (
                    <span className="ml-1 rounded-full bg-blue-500 px-2 py-0.5 text-xs">{Object.values(filters).filter(Boolean).length}</span>
                )}
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 z-50 mt-2 w-80 rounded-lg border border-slate-700/50 bg-slate-800 p-4 shadow-lg">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-sm font-medium text-white">Filters</h3>
                        {hasActiveFilters && (
                            <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-white">
                                Clear all
                            </button>
                        )}
                    </div>

                    <div className="space-y-4">
                        {/* Search */}
                        <div>
                            <label className="mb-2 block text-xs font-medium text-slate-400">Search Commands</label>
                            <input
                                type="text"
                                value={filters.command || ''}
                                onChange={(e) => setFilters({ ...filters, command: e.target.value })}
                                placeholder="Search command or description..."
                                className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                            />
                        </div>

                        {/* Status */}
                        <div>
                            <label className="mb-2 block text-xs font-medium text-slate-400">Status</label>
                            <select
                                value={filters.status}
                                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                            >
                                <option value="">All Statuses</option>
                                <option value="success">Success</option>
                                <option value="failed">Failed</option>
                                <option value="running">Running</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>

                    </div>
                </div>
            )}

            {/* Click outside to close */}
            {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
        </div>
    );
};
