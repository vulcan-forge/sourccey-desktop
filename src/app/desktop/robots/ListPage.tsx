'use client';

import { addOwnedRobot, deleteOwnedRobot, getOwnedRobotByNickname } from '@/api/Local/Robot/owned_robot';
import { getAllRobots } from '@/api/Local/Robot/robot';
import { queryClient } from '@/hooks/default';
import { BASE_OWNED_ROBOT_KEY, useGetOwnedRobots } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import { removePairedRobotConnection, setPairedRobotConnection, usePairedRobotConnections } from '@/hooks/Robot/paired-robot-connection.hook';
import { removeRobotConnectionStatus, setRobotConnectionStatus, useRobotConnectionStatuses } from '@/hooks/Robot/robot-connection-status.hook';
import { invoke } from '@tauri-apps/api/core';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FaEllipsisH, FaSatelliteDish } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastInfoDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { Spinner } from '@/components/Elements/Spinner';

type DiscoveredRobot = {
    host: string;
    robot_name: string;
    nickname: string;
    robot_type: string;
    service_port: number;
};

type PairResult = {
    token: string;
    robot_name: string;
    nickname: string;
    robot_type: string;
    service_port: number;
};

type PairModalTarget = {
    host: string;
    robotName: string;
    nickname: string;
    robotType: string;
    servicePort?: number;
};

export const RobotListPage = () => {
    const { data: ownedRobots, isLoading: isLoadingOwnedRobots }: any = useGetOwnedRobots(true);
    const { data: pairedConnections } = usePairedRobotConnections();
    const { data: connectionStatuses } = useRobotConnectionStatuses();

    const [isDiscovering, setIsDiscovering] = useState(false);
    const [isPairing, setIsPairing] = useState(false);
    const [discoveredRobots, setDiscoveredRobots] = useState<DiscoveredRobot[]>([]);
    const [hasDiscovered, setHasDiscovered] = useState(false);
    const [unpairingId, setUnpairingId] = useState<string | null>(null);
    const [pairingCode, setPairingCode] = useState('');
    const [pairModalTarget, setPairModalTarget] = useState<PairModalTarget | null>(null);

    const normalizeNickname = (nickname: string) => (nickname.startsWith('@') ? nickname.slice(1) : nickname);

    useEffect(() => {
        let cancelled = false;
        let heartbeatInterval: NodeJS.Timeout | null = null;

        const heartbeat = async () => {
            const entries = Object.entries(pairedConnections || {});
            if (entries.length === 0) return;

            await Promise.all(
                entries.map(async ([nickname, connection]) => {
                    try {
                        const statusMessage = await invoke<string>('get_kiosk_robot_status', {
                            host: connection.host,
                            port: connection.port,
                            token: connection.token,
                        });
                        if (cancelled) return;
                        const started = statusMessage.trim().toLowerCase() === 'started';
                        setRobotConnectionStatus(nickname, {
                            connected: true,
                            started,
                            checkedAt: Date.now(),
                            message: started ? 'Robot is started' : 'Robot is stopped',
                        });
                    } catch {
                        if (cancelled) return;
                        setRobotConnectionStatus(nickname, {
                            connected: false,
                            started: false,
                            checkedAt: Date.now(),
                            message: 'Disconnected',
                        });
                    }
                })
            );
        };

        heartbeat();
        heartbeatInterval = setInterval(heartbeat, 10000);

        return () => {
            cancelled = true;
            if (heartbeatInterval) clearInterval(heartbeatInterval);
        };
    }, [pairedConnections]);

    const handleDiscoverRobots = async () => {
        setIsDiscovering(true);
        try {
            const discovered = await invoke<DiscoveredRobot[]>('discover_pairable_robots', { timeoutMs: 1400 });
            const ownedNicknames = new Set(
                (ownedRobots || [])
                    .map((ownedRobot: any) => ownedRobot?.owned_robot?.nickname || ownedRobot?.nickname || '')
                    .map((nickname: string) => normalizeNickname(nickname))
                    .filter((nickname: string) => nickname.length > 0)
            );
            const pairedNicknames = new Set(Object.keys(pairedConnections || {}).map((nickname) => normalizeNickname(nickname)));
            const filtered = discovered.filter((robot) => {
                const normalized = normalizeNickname(robot.nickname || '');
                return normalized && !ownedNicknames.has(normalized) && !pairedNicknames.has(normalized);
            });

            setDiscoveredRobots(filtered);
            if (filtered.length === 0) {
                toast.info('No new robots found.', { ...toastInfoDefaults });
            }
        } catch (error: any) {
            toast.error(error?.message || 'Failed to discover robots.', { ...toastErrorDefaults });
        } finally {
            setIsDiscovering(false);
            setHasDiscovered(true);
        }
    };

    const openPairModal = (target: PairModalTarget) => {
        setPairingCode('');
        setPairModalTarget(target);
    };

    const requestPairingModalOnRobot = async (host: string) => {
        if (!host) return;
        try {
            await invoke('request_kiosk_pairing_modal', { host });
        } catch (error: any) {
            toast.error(error?.message || 'Failed to show pairing code on robot.', { ...toastErrorDefaults });
        }
    };

    const handleSelectDiscovered = (robot: DiscoveredRobot) => {
        openPairModal({
            host: robot.host,
            servicePort: robot.service_port,
            robotName: robot.robot_name,
            nickname: robot.nickname,
            robotType: robot.robot_type,
        });
        void requestPairingModalOnRobot(robot.host);
    };

    const pairRobotWithTarget = async (target: PairModalTarget, code: string) => {
        if (!target.host || !code.trim()) {
            toast.error('Missing robot host or pairing code.', { ...toastErrorDefaults });
            return;
        }

        setIsPairing(true);
        try {
            const result = await invoke<PairResult>('pair_with_kiosk_robot', {
                host: target.host,
                code: code.trim(),
                client_name: 'Desktop App',
            });

            const robots = await getAllRobots();
            const matchedRobot =
                robots.find((robot: any) => (robot?.robot_type || '').toLowerCase() === (result.robot_type || '').toLowerCase()) ||
                robots.find((robot: any) => (robot?.name || '').toLowerCase() === (result.robot_name || '').toLowerCase()) ||
                robots[0];

            if (!matchedRobot?.id) {
                throw new Error('No robot template available locally. Sync robots first.');
            }

            const existingOwnedRobot: any = await getOwnedRobotByNickname(result.nickname);
            let ownedRobotId = existingOwnedRobot?.owned_robot?.id || existingOwnedRobot?.id || '';

            if (!existingOwnedRobot) {
                const createdOwnedRobot: any = await addOwnedRobot(matchedRobot.id, result.nickname);
                ownedRobotId = createdOwnedRobot?.id || ownedRobotId;
            }

            setPairedRobotConnection(result.nickname, {
                nickname: result.nickname,
                host: target.host,
                port: result.service_port,
                token: result.token,
                robotType: result.robot_type,
                robotName: result.robot_name,
                pairedAt: Date.now(),
            });
            setRobotConnectionStatus(result.nickname, {
                connected: true,
                started: false,
                checkedAt: Date.now(),
                message: 'Paired and reachable',
            });

            await queryClient.invalidateQueries({ queryKey: [BASE_OWNED_ROBOT_KEY] });
            toast.success(`Paired with ${result.robot_name} and added to your robots.`, { ...toastSuccessDefaults });
            setPairModalTarget(null);
            setPairingCode('');
        } catch (error: any) {
            console.log('error', error);
            toast.error(error?.message || 'Failed to pair robot.', { ...toastErrorDefaults });
        } finally {
            setIsPairing(false);
        }
    };

    const handlePairFromModal = async () => {
        if (!pairModalTarget) return;
        await pairRobotWithTarget(pairModalTarget, pairingCode);
    };

    const handleUnpairRobot = async (robot: any) => {
        if (!robot?.id && !robot?.normalizedNickname) {
            toast.error('Unable to unpair this robot.', { ...toastErrorDefaults });
            return;
        }

        const label = robot?.name || robot?.nickname || 'this robot';

        setUnpairingId(robot?.id || robot?.normalizedNickname || null);
        try {
            if (robot?.id) {
                await deleteOwnedRobot(String(robot.id));
            }
            if (robot?.normalizedNickname) {
                removePairedRobotConnection(robot.normalizedNickname);
                removeRobotConnectionStatus(robot.normalizedNickname);
            }

            await queryClient.invalidateQueries({ queryKey: [BASE_OWNED_ROBOT_KEY] });
            toast.success(`Unpaired ${label}.`, { ...toastSuccessDefaults });
        } catch (error: any) {
            toast.error(error?.message || 'Failed to unpair robot.', { ...toastErrorDefaults });
        } finally {
            setUnpairingId(null);
        }
    };

    const connectedRobots = (ownedRobots || []).map((ownedRobot: any) => {
        const rawNickname = ownedRobot?.owned_robot?.nickname || ownedRobot?.nickname || '';
        const normalizedNickname = normalizeNickname(rawNickname);
        const paired = !!pairedConnections?.[normalizedNickname];
        const connection = pairedConnections?.[normalizedNickname];
        const runtimeStatus = connectionStatuses?.[normalizedNickname];
        return {
            id: ownedRobot?.owned_robot?.id || ownedRobot.id,
            name: ownedRobot?.robot?.name || 'Robot',
            nickname: normalizedNickname ? `@${normalizedNickname}` : '',
            normalizedNickname,
            image: ownedRobot?.robot?.image || null,
            robotType: ownedRobot?.robot?.robot_type || 'Unknown',
            source: paired ? 'Paired' : 'Connected',
            isConnected: !!runtimeStatus?.connected,
            isStarted: !!runtimeStatus?.started,
            host: connection?.host || '',
        };
    });
    const robotsToRender = connectedRobots;

    return (
        <div className="min-h-screen bg-slate-900/30 p-8">
            <div className="mx-auto max-w-7xl">
                <div className="mb-4">
                    <h1 className="text-3xl font-bold text-white">Robots</h1>
                    <p className="mt-2 text-slate-300">Manage your nearby robots.</p>
                </div>

                <div className="mb-6 border-b border-slate-700 pb-4">
                    <DiscoverabilityPanel
                        isDiscovering={isDiscovering}
                        discoveredRobots={discoveredRobots}
                        hasDiscovered={hasDiscovered}
                        onDiscover={handleDiscoverRobots}
                        onSelectDiscovered={handleSelectDiscovered}
                    />
                </div>

                {isLoadingOwnedRobots ? (
                    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border-2 border-slate-700 bg-slate-900/80 shadow-xl">
                        <div className="flex items-center gap-3 text-slate-300">
                            <Spinner color="orange" width="w-6" height="h-6" />
                            <span className="text-sm font-semibold">Loading robots...</span>
                        </div>
                    </div>
                ) : robotsToRender.length === 0 ? (
                    <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-8 text-center text-slate-300 shadow-xl">
                        No robots yet. Discover and pair a nearby robot to get started.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                        {robotsToRender.map((robot: any) => {
                            const robotName = robot.name || 'Robot';
                            const nickname = robot.nickname || '';

                            return (
                                <RobotCard
                                    key={robot.id}
                                    robot={robot}
                                    robotName={robotName}
                                    nickname={nickname}
                                    onUnpair={handleUnpairRobot}
                                    isUnpairing={unpairingId === robot.id || unpairingId === robot.normalizedNickname}
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            {pairModalTarget && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            handlePairFromModal();
                        }}
                        className="w-full max-w-md rounded-xl border-2 border-slate-600 bg-slate-900/90 p-5 shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-white">Pair Robot</h3>
                                <p className="mt-1 text-sm text-slate-300">{pairModalTarget.robotName}</p>
                            </div>
                            <div className="shrink-0 rounded-full border border-slate-600 bg-slate-800/70 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
                                @{pairModalTarget.nickname}
                            </div>
                        </div>
                        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
                            <span className="text-slate-400">Host</span>: {pairModalTarget.host}
                        </div>

                        <input
                            value={pairingCode}
                            onChange={(event) => setPairingCode(event.target.value)}
                            placeholder="Enter 6-digit pairing code"
                            className="mt-4 w-full rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-white placeholder-slate-500 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/30 focus:outline-none"
                        />

                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setPairModalTarget(null)}
                                className="cursor-pointer rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!pairingCode.trim() || isPairing}
                                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                                    !pairingCode.trim() || isPairing
                                        ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                                        : 'cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700'
                                }`}
                            >
                                {isPairing ? 'Pairing...' : 'Pair'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

type DiscoverabilityPanelProps = {
    isDiscovering: boolean;
    discoveredRobots: DiscoveredRobot[];
    hasDiscovered: boolean;
    onDiscover: () => void;
    onSelectDiscovered: (robot: DiscoveredRobot) => void;
};

const DiscoverabilityPanel = ({
    isDiscovering,
    discoveredRobots,
    hasDiscovered,
    onDiscover,
    onSelectDiscovered,
}: DiscoverabilityPanelProps) => {
    return (
        <div className="flex flex-col gap-4 rounded-2xl border-2 border-slate-700 bg-slate-900 p-4 shadow-xl">
            <div className="flex w-full">
                <div className="flex items-center gap-3">
                    <FaSatelliteDish className="h-4 w-4 text-blue-400" />
                    <div>
                        <h2 className="text-base font-semibold text-white">Discover Nearby Robots</h2>
                        <p className="text-xs text-slate-400">Find a kiosk on your network and pair it to your account.</p>
                    </div>
                </div>

                <div className="grow"></div>

                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">
                        {discoveredRobots.length > 0
                            ? `${discoveredRobots.length} new robot(s) found`
                            : hasDiscovered
                              ? 'No new robots found'
                              : ''}
                    </span>
                    <button
                        onClick={onDiscover}
                        disabled={isDiscovering}
                        className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                            isDiscovering
                                ? 'cursor-not-allowed bg-slate-600 text-slate-300'
                                : 'cursor-pointer bg-blue-600/90 text-white hover:bg-blue-600'
                        }`}
                    >
                        {isDiscovering ? (
                            <span className="inline-flex items-center gap-2">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200/70 border-t-transparent" />
                                Discovering
                            </span>
                        ) : (
                            'Discover'
                        )}
                    </button>
                </div>
            </div>

            {discoveredRobots.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {discoveredRobots.map((robot) => (
                        <DiscoveredRobotCard key={`${robot.host}-${robot.nickname}`} robot={robot} onSelect={onSelectDiscovered} />
                    ))}
                </div>
            )}
        </div>
    );
};

type DiscoveredRobotCardProps = {
    robot: DiscoveredRobot;
    onSelect: (robot: DiscoveredRobot) => void;
};

const DiscoveredRobotCard = ({ robot, onSelect }: DiscoveredRobotCardProps) => {
    return (
        <button
            type="button"
            onClick={() => onSelect(robot)}
            className="cursor-pointer rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-700/70"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{robot.robot_name}</div>
                    <div className="mt-1 text-xs text-slate-400">IP: {robot.host}</div>
                </div>
                <div className="shrink-0 rounded-full border border-slate-600 bg-slate-700/70 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
                    @{robot.nickname}
                </div>
            </div>
        </button>
    );
};

type RobotCardProps = {
    robot: any;
    robotName: string;
    nickname: string;
    onUnpair: (robot: any) => void;
    isUnpairing: boolean;
};

const RobotCard = ({ robot, robotName, nickname, onUnpair, isUnpairing }: RobotCardProps) => {
    const hostLabel = robot.host;
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="flex w-full flex-col gap-4 rounded-2xl border-2 border-slate-700 bg-slate-900 p-4 shadow-xl transition-colors">
            <div className="flex w-full gap-2">
                <div className="flex flex-col items-start">
                    <div className="text-lg font-semibold text-white">{robotName}</div>
                    <div className="text-xs text-slate-400">{nickname || 'unnamed'}</div>
                </div>
                <div className="grow"></div>
                <div className="flex items-start gap-2">
                    {hostLabel && <div className="text-xs text-slate-400">IP: {hostLabel}</div>}
                    <div className="relative" ref={menuRef}>
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
                                    {isUnpairing ? 'Unpairing...' : 'Unpair'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Link
                href={`/app/owned-robots?id=${robot.id}`}
                className="inline-flex w-full cursor-pointer items-center justify-center rounded-md bg-gradient-to-r from-red-400/50 via-orange-400/50 to-yellow-400/50 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all duration-200 hover:from-red-500/70 hover:via-orange-500/70 hover:to-yellow-500/70"
            >
                Manage Robot
            </Link>
        </div>
    );
};
