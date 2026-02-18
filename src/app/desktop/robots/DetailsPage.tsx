'use client';

import { FEATURE_ICONS } from '@/components/Elements/Robots/common';
import { Spinner } from '@/components/Elements/Spinner';
import { useGetRobot } from '@/hooks/Models/Robot/robot.hook';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FaBolt, FaBrain, FaChartLine, FaHandPaper } from 'react-icons/fa';
import { TbRobot } from 'react-icons/tb';

interface RobotFeature {
    id: string;
    name: string;
    description: string;
    icon: string;
}

interface RobotMedia {
    id: string;
    name: string;
    description: string;
    image: string;
}

export const RobotDetailsPage = () => {
    const params = useParams();
    const { data: robot, isLoading } = useGetRobot({ id: params.id as string });

    if (!robot || isLoading) {
        return (
            <div className="flex h-24 w-full items-center justify-center">
                <Spinner />
            </div>
        );
    }

    const hasCapabilities = robot.can_drive || robot.can_walk || robot.can_swim || robot.can_fly;
    return (
        <div className="flex h-full w-full flex-col space-y-6 overflow-y-auto p-6">
            {/* Top Section - Two Columns */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Left Column - Basic Info */}
                <div className="flex h-full flex-col space-y-6">
                    {/* Header Info */}
                    <div className="flex-1 rounded-xl border-2 border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur-sm">
                        <div className="mb-4 flex">
                            <div className="flex flex-col items-start justify-between">
                                <h1 className="text-3xl font-bold text-white">{robot.name}</h1>
                                <p className="text-lg text-slate-400">{robot.long_name}</p>
                            </div>

                            <div className="grow" />

                            {/* GitHub Link */}
                            {robot.github_url && (
                                <Link
                                    href={robot.github_url}
                                    target="_blank"
                                    className="inline-flex h-10 items-center rounded-lg border border-slate-600 bg-slate-700 px-4 text-sm font-medium text-slate-300 transition-colors duration-100 hover:bg-slate-600 hover:text-white"
                                >
                                    View on GitHub
                                </Link>
                            )}
                        </div>
                        <p className="text-slate-300">{robot.description}</p>
                        <div className="mt-6 flex flex-wrap items-center gap-4">
                            {/* Primary Action */}
                            <button className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 text-sm font-medium text-white transition-all duration-300 hover:from-orange-600 hover:to-orange-700 hover:shadow-lg hover:shadow-orange-500/20">
                                Register Robot
                            </button>

                            <div className="grow" />

                            {/* Secondary Action */}
                            <button className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-emerald-400/40 bg-gradient-to-r from-emerald-500/40 via-green-500/40 to-teal-500/40 px-4 text-sm font-medium text-white transition-all duration-300 hover:border-emerald-400/60 hover:from-emerald-500/60 hover:via-green-500/60 hover:to-teal-500/60">
                                Buy Robot
                            </button>
                        </div>
                    </div>

                    <div className="grow"></div>

                    {/* Performance Metrics */}
                    <div className="flex-1 rounded-xl border-2 border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur-sm">
                        <h2 className="mb-4 text-xl font-semibold text-white">Performance Metrics</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="rounded-lg bg-slate-700/50 p-4">
                                <div className="flex items-center space-x-3">
                                    <FaChartLine className="h-5 w-5 text-orange-500" />
                                    <div>
                                        <div className="text-sm text-slate-400">Performance</div>
                                        <div className="text-lg font-semibold text-white">{robot.stats.performance_index}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-lg bg-slate-700/50 p-4">
                                <div className="flex items-center space-x-3">
                                    <FaBrain className="h-5 w-5 text-orange-500" />
                                    <div>
                                        <div className="text-sm text-slate-400">Cognitive</div>
                                        <div className="text-lg font-semibold text-white">{robot.stats.cognitive_index}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-lg bg-slate-700/50 p-4">
                                <div className="flex items-center space-x-3">
                                    <FaHandPaper className="h-5 w-5 text-orange-500" />
                                    <div>
                                        <div className="text-sm text-slate-400">Dexterity</div>
                                        <div className="text-lg font-semibold text-white">{robot.stats.dexterity_index}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-lg bg-slate-700/50 p-4">
                                <div className="flex items-center space-x-3">
                                    <FaBolt className="h-5 w-5 text-orange-500" />
                                    <div>
                                        <div className="text-sm text-slate-400">Energy</div>
                                        <div className="text-lg font-semibold text-white">{robot.stats.energy_index}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column - Image */}
                <div className="h-full">
                    <div className="h-full rounded-xl border-2 border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur-sm">
                        <div className="aspect-square h-full overflow-hidden rounded-lg">
                            <Image src={robot.image} alt={robot.name} width={400} height={400} className="h-full w-full object-contain" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Capabilities */}
            {hasCapabilities && (
                <div className="rounded-xl border-2 border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur-sm">
                    <h2 className="mb-4 text-xl font-semibold text-white">Capabilities</h2>
                    <div className="grid grid-cols-2 gap-4">
                        {robot.can_drive && (
                            <div className="flex items-center space-x-2 text-slate-300">
                                <TbRobot className="h-5 w-5 text-orange-500" />
                                <span>Ground Navigation</span>
                            </div>
                        )}
                        {robot.can_walk && (
                            <div className="flex items-center space-x-2 text-slate-300">
                                <TbRobot className="h-5 w-5 text-orange-500" />
                                <span>Bipedal Movement</span>
                            </div>
                        )}
                        {robot.can_swim && (
                            <div className="flex items-center space-x-2 text-slate-300">
                                <TbRobot className="h-5 w-5 text-orange-500" />
                                <span>Aquatic Operation</span>
                            </div>
                        )}
                        {robot.can_fly && (
                            <div className="flex items-center space-x-2 text-slate-300">
                                <TbRobot className="h-5 w-5 text-orange-500" />
                                <span>Aerial Navigation</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bottom Section - Single Column */}
            <div className="space-y-6">
                {/* Features */}
                <div className="rounded-xl border-2 border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur-sm">
                    <h2 className="mb-6 text-2xl font-semibold text-white">Features</h2>
                    <div className="grid gap-6 md:grid-cols-2">
                        {robot.features?.map((feature: RobotFeature) => {
                            const Icon = FEATURE_ICONS[feature.icon as keyof typeof FEATURE_ICONS].icon;
                            return (
                                <div
                                    key={feature.id}
                                    className="group relative rounded-lg bg-slate-700/50 p-6 transition-all duration-300 hover:-translate-y-1 hover:bg-slate-700/70 hover:shadow-lg hover:shadow-black/20"
                                >
                                    <div className="flex items-start space-x-4">
                                        <div className="flex-shrink-0">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/10 group-hover:bg-orange-500/20">
                                                <Icon className="h-6 w-6 text-orange-500" />
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="mb-2 text-lg font-medium text-white group-hover:text-orange-400">{feature.name}</h3>
                                            <p className="text-sm leading-relaxed text-slate-300">{feature.description}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Media Gallery */}
                {robot.media && robot.media.length > 0 && (
                    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur-sm">
                        <h2 className="mb-6 text-2xl font-semibold text-white">Media Gallery</h2>
                        <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
                            {robot.media.map((item: RobotMedia) => (
                                <div key={item.id} className="overflow-hidden rounded-lg">
                                    <Image src={item.image} alt={item.name} width={300} height={300} className="h-full w-full object-cover" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
