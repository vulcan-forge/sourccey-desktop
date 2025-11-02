import { DefaultGraphQLFilter, SearchBar } from '@/components/Elements/SearchBar';
import { BASE_ROBOT_KEY } from '@/hooks/Models/Robot/robot.hook';
import { SEARCH_VALUE_KEY } from '@/hooks/search.hook';
import { useEffect, useRef, useState } from 'react';
import { FaFilter, FaList, FaThLarge } from 'react-icons/fa';

interface AllRobotsActionBarProps {
    viewType: 'grid' | 'list';
    setViewType: (viewType: 'grid' | 'list') => void;
    statusFilter: string;
    setStatusFilter: (statusFilter: string) => void;
}

export const ActionBar = ({ viewType, setViewType, statusFilter, setStatusFilter }: AllRobotsActionBarProps) => {
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 backdrop-blur-sm">
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:space-x-4">
                {/* Search Section */}
                <SearchBar
                    classNames="relative flex-1"
                    placeholderText="Search robots..."
                    searchKey={SEARCH_VALUE_KEY}
                    refetchKey={[BASE_ROBOT_KEY]}
                    filter={DefaultGraphQLFilter}
                />

                {/* Controls Section */}
                <div className="flex items-center gap-3">
                    {/* View Toggle */}
                    <div className="flex rounded-lg bg-slate-900/50 p-1.5">
                        <button
                            onClick={() => setViewType('grid')}
                            className={`cursor-pointer rounded-lg p-2 transition-all duration-200 ${
                                viewType === 'grid'
                                    ? 'bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 text-white'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            <FaThLarge className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setViewType('list')}
                            className={`cursor-pointer rounded-lg p-2 transition-all duration-200 ${
                                viewType === 'list'
                                    ? 'bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 text-white'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            <FaList className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Filter Dropdown */}
                    <div className="relative" ref={filterRef}>
                        <button
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className={`z-50 flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900/50 px-4 py-3 text-sm font-medium ${
                                statusFilter !== 'all' ? 'text-yellow-400' : 'text-slate-400 hover:text-white'
                            } transition-all duration-300`}
                        >
                            <FaFilter className="h-3.5 w-3.5" />
                            <span>Filters</span>
                            {statusFilter !== 'all' && <span className="ml-1.5 rounded-full px-2 py-0.5 text-xs">1</span>}
                        </button>

                        {/* Dropdown Menu */}
                        {isFilterOpen && (
                            <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-lg bg-slate-800 shadow-lg ring-1 ring-slate-700/50">
                                <div className="p-2">
                                    <div className="mb-2 px-3 py-2 text-xs font-semibold text-slate-400">Status</div>
                                    {['all', 'active', 'charging', 'standby'].map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => {
                                                setStatusFilter(status);
                                                setIsFilterOpen(false);
                                            }}
                                            className={`flex w-full items-center rounded-md px-3 py-2 text-sm transition-colors duration-200 ${
                                                statusFilter === status
                                                    ? 'text-yellow-400'
                                                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                                            }`}
                                        >
                                            <span className="capitalize">{status === 'all' ? 'All Status' : status}</span>
                                            {statusFilter === status && <span className="ml-auto text-yellow-400">✓</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
