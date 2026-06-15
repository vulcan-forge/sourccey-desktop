'use client';

import { deleteOwnedRobot } from '@/api/Local/Robot/owned_robot';
import { Spinner } from '@/components/Elements/Spinner';
import { BASE_OWNED_ROBOT_KEY, useGetOwnedRobots } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import { queryClient } from '@/hooks/default';
import type { DiscoveredLanRobot } from '@/types/robots/lan-discovery';
import { safeNavigate } from '@/utils/navigation';
import { buildLanRobotDraftFromHost, type LanRobotDraft } from '@/utils/robots/lan-robot';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FaCompass, FaEllipsisH, FaInfoCircle, FaNetworkWired } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { AddLanRobotModal } from '@/components/PageComponents/Robots/AddLanRobotModal';
import { DiscoverLanRobotsModal } from '@/components/PageComponents/Robots/DiscoverLanRobotsModal';
import { RobotSetupHelpModal } from '@/components/PageComponents/Robots/RobotSetupHelpModal';

export const RobotListPage = () => {
    const { data: ownedRobots, isLoading: isLoadingOwnedRobots }: any = useGetOwnedRobots(true);
    const [unpairingId, setUnpairingId] = useState<string | null>(null);
    const [isAddLanRobotOpen, setIsAddLanRobotOpen] = useState(false);
    const [isDiscoverOpen, setIsDiscoverOpen] = useState(false);
    const [isSetupHelpOpen, setIsSetupHelpOpen] = useState(false);
    const [draftOverride, setDraftOverride] = useState<Partial<LanRobotDraft> | null>(null);
    const router = useRouter();

    const robotsToRender = (ownedRobots || []).map((ownedRobot: any) => ({
        id: ownedRobot?.owned_robot?.id || ownedRobot.id,
        name: ownedRobot?.robot?.name || 'Robot',
        nickname: ownedRobot?.owned_robot?.nickname || ownedRobot?.nickname || '',
        robotType: ownedRobot?.robot?.robot_type || 'Unknown',
    }));
    const existingNicknames = robotsToRender.map((robot: any) => robot.nickname).filter(Boolean);

    const openAddRobotModal = (initialDraft?: Partial<LanRobotDraft> | null) => {
        setDraftOverride(initialDraft ?? null);
        setIsAddLanRobotOpen(true);
    };

    const handleUseDiscoveredRobot = (robot: DiscoveredLanRobot) => {
        setIsDiscoverOpen(false);
        openAddRobotModal(buildLanRobotDraftFromHost(robot.ipAddress, existingNicknames));
    };

    const handleUnpairRobot = async (robot: any) => {
        if (!robot?.id) {
            toast.error('Unable to remove this robot.', { ...toastErrorDefaults });
            return;
        }

        const confirmed = window.confirm(`Remove ${robot.name || robot.nickname || 'this robot'} from this desktop?`);
        if (!confirmed) {
            return;
        }

        setUnpairingId(robot.id);
        try {
            await deleteOwnedRobot(String(robot.id));
            await queryClient.invalidateQueries({ queryKey: [BASE_OWNED_ROBOT_KEY] });
            toast.success(`Removed ${robot.name || robot.nickname || 'robot'} from this desktop.`, {
                ...toastSuccessDefaults,
            });
        } catch (error: any) {
            toast.error(error?.message || 'Failed to remove robot.', { ...toastErrorDefaults });
        } finally {
            setUnpairingId(null);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900/30 p-8">
            <div className="mx-auto max-w-7xl">
                <div className="mb-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-white">Robots</h1>
                            <p className="mt-2 text-slate-300">Manage the robots configured on this desktop for LAN teleoperation.</p>
                        </div>
                    </div>
                </div>

                <div className="mb-6 rounded-2xl border-2 border-slate-700 bg-slate-900 p-4 shadow-xl">
                    <div className="flex items-start gap-3">
                        <FaNetworkWired className="mt-1 h-4 w-4 shrink-0 text-amber-300" />
                        <div className="min-w-0 flex-1">
                            <h2 className="text-base font-semibold text-white">LAN Teleop Connection</h2>
                            <p className="mt-1 text-sm text-slate-300">
                                Discover a robot on your network or add it directly with its LAN address, then open Manage Robot to
                                calibrate and teleoperate it. Kiosk keeps the cloud pairing flow, but desktop stays LAN-first.
                            </p>
                            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsSetupHelpOpen(true)}
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-600 px-3 py-1.5 text-sm font-semibold text-slate-100 transition hover:border-slate-400"
                                >
                                    <FaInfoCircle className="h-4 w-4" />
                                    How Setup Works
                                </button>
                                <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsDiscoverOpen(true)}
                                        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/70"
                                    >
                                        <FaCompass className="h-4 w-4" />
                                        Discover
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openAddRobotModal()}
                                        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-100 transition hover:border-amber-400/70"
                                    >
                                        <FaNetworkWired className="h-4 w-4" />
                                        Add Manually
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {isLoadingOwnedRobots ? (
                    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border-2 border-slate-700 bg-slate-900/80 shadow-xl">
                        <div className="flex items-center gap-3 text-slate-300">
                            <Spinner color="yellow" width="w-6" height="h-6" />
                            <span className="text-sm font-semibold">Loading robots...</span>
                        </div>
                    </div>
                ) : robotsToRender.length === 0 ? (
                    <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-8 text-center text-slate-300 shadow-xl">
                        No LAN robots added yet. Add a robot on this desktop, save its LAN address, and you can teleoperate it here.
                        <div className="mt-4 flex flex-wrap justify-center gap-3">
                            <button
                                type="button"
                                onClick={() => setIsDiscoverOpen(true)}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/70"
                            >
                                <FaCompass className="h-4 w-4" />
                                Discover Robots
                            </button>
                            <button
                                type="button"
                                onClick={() => openAddRobotModal()}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-400/70"
                            >
                                <FaNetworkWired className="h-4 w-4" />
                                Add Manually
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                        {robotsToRender.map((robot: any) => (
                            <RobotCard
                                key={robot.id}
                                robot={robot}
                                onUnpair={handleUnpairRobot}
                                isUnpairing={unpairingId === robot.id}
                            />
                        ))}
                    </div>
                )}

                <AddLanRobotModal
                    isOpen={isAddLanRobotOpen}
                    initialDraft={draftOverride}
                    existingNicknames={existingNicknames}
                    onClose={() => {
                        setIsAddLanRobotOpen(false);
                        setDraftOverride(null);
                    }}
                    onSuccess={async (ownedRobotId) => {
                        await queryClient.invalidateQueries({ queryKey: [BASE_OWNED_ROBOT_KEY] });
                        safeNavigate(router, `/desktop/robot?id=${ownedRobotId}`);
                    }}
                />
                <DiscoverLanRobotsModal
                    isOpen={isDiscoverOpen}
                    onClose={() => setIsDiscoverOpen(false)}
                    onSelectRobot={handleUseDiscoveredRobot}
                />
                <RobotSetupHelpModal isOpen={isSetupHelpOpen} onClose={() => setIsSetupHelpOpen(false)} />
            </div>
        </div>
    );
};

type RobotCardProps = {
    robot: any;
    onUnpair: (robot: any) => void;
    isUnpairing: boolean;
};

const RobotCard = ({ robot, onUnpair, isUnpairing }: RobotCardProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const router = useRouter();

    return (
        <div className="flex w-full flex-col gap-4 rounded-2xl border-2 border-slate-700 bg-slate-900 p-4 shadow-xl transition-colors">
            <div className="flex w-full gap-2">
                <div className="flex flex-col items-start">
                    <div className="text-lg font-semibold text-white">{robot.name || 'Robot'}</div>
                    <div className="text-xs text-slate-400">{robot.nickname || 'unnamed'}</div>
                </div>
                <div className="grow" />
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setIsMenuOpen((open) => !open)}
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-2 border-slate-600 text-slate-300 transition-colors hover:bg-slate-700/60 hover:text-white"
                        aria-label="Robot settings"
                    >
                        <FaEllipsisH className="h-4 w-4" />
                    </button>
                    {isMenuOpen && (
                        <div className="absolute top-10 right-0 z-20 w-40 rounded-lg border-2 border-slate-600 bg-slate-800 shadow-lg">
                            <button
                                type="button"
                                disabled={isUnpairing}
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    onUnpair(robot);
                                }}
                                className={`flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                                    isUnpairing
                                        ? 'cursor-not-allowed text-slate-500'
                                        : 'text-red-300 hover:bg-slate-700/70 hover:text-red-200'
                                }`}
                            >
                                {isUnpairing ? 'Removing...' : 'Remove'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{robot.robotType || 'Unknown'}</div>

            <button
                type="button"
                onClick={() => {
                    safeNavigate(router, `/desktop/robot?id=${robot.id}`);
                }}
                className="inline-flex w-full cursor-pointer items-center justify-center rounded-md bg-gradient-to-r from-red-400/50 via-orange-400/50 to-yellow-400/50 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all duration-200 hover:from-red-500/70 hover:via-orange-500/70 hover:to-yellow-500/70"
            >
                Manage Robot
            </button>
        </div>
    );
};
