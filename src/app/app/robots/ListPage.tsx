'use client';

import { getAllRobots } from '@/api/Local/Robot/robot';
import type { Robot } from '@/types/Models/robot';
import { RobotCard } from '@/components/Elements/Robots/Robots/RobotCard';
import { useState, useEffect } from 'react';
import { FaRobot, FaSearch } from 'react-icons/fa';
import { HiChevronDown } from 'react-icons/hi';
import { AddMyRobotModal } from '@/components/Elements/Modals/AddRobot/AddMyRobotModal';
export const RobotListPage = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedType, setSelectedType] = useState<string>('all');
    const [selectedCapability, setSelectedCapability] = useState<string>('all');

    const [robots, setRobots] = useState<Robot[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchRobots = async (setter: (robots: Robot[]) => void) => {
        setLoading(true);
        setError(null);

        try {
            const result = await getAllRobots();
            setter(result);
        } catch (err) {
            console.error('Error details:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch robots');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRobots(setRobots);
    }, []);

    const filteredRobots = robots;

    return (
        <div className="flex h-full flex-col">
            <AddMyRobotModal />

            {/* Top Bar - Filtering and Searching */}
            <div className="border-b border-slate-700/50 bg-slate-800/60 p-6 backdrop-blur-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-1 items-center gap-4">
                        {/* Search Bar */}
                        <div className="relative max-w-md flex-1">
                            <FaSearch className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search robots..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-10 py-2 text-white placeholder-slate-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 focus:outline-none"
                            />
                        </div>

                        {/* Type Filter */}
                        <div className="relative">
                            <select
                                value={selectedType}
                                onChange={(e) => setSelectedType(e.target.value)}
                                className="appearance-none rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 pr-8 text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 focus:outline-none"
                            >
                                <option value="all">All Types</option>
                                <option value="follower">Follower</option>
                                <option value="manipulator">Manipulator</option>
                                <option value="warehouse">Warehouse</option>
                                <option value="underwater">Underwater</option>
                                <option value="aerial">Aerial</option>
                            </select>
                            <HiChevronDown className="pointer-events-none absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>

                        {/* Capability Filter */}
                        <div className="relative">
                            <select
                                value={selectedCapability}
                                onChange={(e) => setSelectedCapability(e.target.value)}
                                className="appearance-none rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 pr-8 text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 focus:outline-none"
                            >
                                <option value="all">All Capabilities</option>
                                <option value="drive">Can Drive</option>
                                <option value="walk">Can Walk</option>
                                <option value="swim">Can Swim</option>
                                <option value="fly">Can Fly</option>
                            </select>
                            <HiChevronDown className="pointer-events-none absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                    </div>
                    <div className="text-sm text-slate-400">
                        Showing {filteredRobots.length} of {robots.length} robots
                    </div>
                </div>

                {/* Results Count */}
            </div>

            {/* Robot Grid */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredRobots.map((robot) => (
                        <RobotCard key={robot.id} robot={robot} />
                    ))}
                </div>

                {/* Empty State */}
                {filteredRobots.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <FaRobot className="h-16 w-16 text-slate-600" />
                        <h3 className="mt-4 text-lg font-semibold text-white">No robots found</h3>
                        <p className="mt-2 text-slate-400">Try adjusting your search or filters</p>
                    </div>
                )}
            </div>
        </div>
    );
};
