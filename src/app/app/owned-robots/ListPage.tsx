'use client';

import React, { useRef, useState } from 'react';
import { FaSearch } from 'react-icons/fa';
import { HiChevronDown } from 'react-icons/hi';
import { Spinner } from '@/components/Elements/Spinner';
import { MyRobotCard } from '@/components/Elements/Robots/MyRobots/MyRobotCard';
import { useGetOwnedRobots } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import { useGetProfile } from '@/hooks/Models/Profile/profile.hook';

interface RobotContentProps {}

export const MyRobotListPage = ({}: RobotContentProps) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedType, setSelectedType] = useState<string>('all');
    const [selectedCapability, setSelectedCapability] = useState<string>('all');

    const { data: profile, isLoading: isLoadingProfile }: any = useGetProfile();
    const enabled = !isLoadingProfile && !!profile?.id;
    const { data: ownedRobots, isLoading: isLoadingOwnedRobots }: any = useGetOwnedRobots(profile?.id, enabled);

    const detailsRef = useRef<HTMLDivElement>(null);

    // Filter robots based on search and filters
    const filteredRobots =
        ownedRobots?.filter((robot: any) => {
            const matchesSearch =
                robot?.robot?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                robot?.robot?.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (robot.nickname && robot.nickname.toLowerCase().includes(searchTerm.toLowerCase()));

            const matchesType = selectedType === 'all' || robot.robot.type === selectedType;
            const matchesCapability = selectedCapability === 'all' || robot.robot.capabilities?.includes(selectedCapability);

            return matchesSearch && matchesType && matchesCapability;
        }) || [];

    return (
        <div ref={detailsRef} className="flex h-full flex-col">
            {/* Top Bar - Filtering and Searching */}
            <div className="border-slate-750 bg-slate-850 border-b p-4 backdrop-blur-sm sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                        {/* Search Bar */}
                        <div className="relative flex-1">
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
                        Showing {filteredRobots.length} of {ownedRobots?.length || 0} robots
                    </div>
                </div>
            </div>

            {/* Content */}
            {isLoadingOwnedRobots && (
                <div className="flex h-100 items-center justify-center">
                    <Spinner />
                </div>
            )}

            {!isLoadingOwnedRobots && (
                <div className="bg-slate-850 grid grid-cols-1 gap-4 p-4 sm:gap-6 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
                    {filteredRobots.map((ownedRobot: any) => (
                        <MyRobotCard key={ownedRobot.id} ownedRobot={ownedRobot} />
                    ))}
                </div>
            )}

            {!isLoadingOwnedRobots && filteredRobots.length === 0 && (
                <div className="flex h-64 items-center justify-center">
                    <div className="text-center">
                        <div className="mb-4 text-4xl">🤖</div>
                        <h3 className="mb-2 text-lg font-semibold text-white">No robots found</h3>
                        <p className="text-slate-400">Try adjusting your search or filters</p>
                    </div>
                </div>
            )}
        </div>
    );
};
