'use client';

import { addOwnedRobot, deleteOwnedRobot, getOwnedRobotByNickname } from '@/api/Local/Robot/owned_robot';
import { getAllRobots } from '@/api/Local/Robot/robot';
import { queryClient } from '@/hooks/default';
import { BASE_OWNED_ROBOT_KEY, useGetOwnedRobots } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import { useGetProfile } from '@/hooks/Models/Profile/profile.hook';
import {
    removePairedRobotConnection,
    setPairedRobotConnection,
    usePairedRobotConnections,
} from '@/hooks/Robot/paired-robot-connection.hook';
import {
    removeRobotConnectionStatus,
    setRobotConnectionStatus,
    useRobotConnectionStatuses,
} from '@/hooks/Robot/robot-connection-status.hook';
import { setSelectedRobot, useSelectedRobot } from '@/hooks/Robot/selected-robot.hook';
import { invoke } from '@tauri-apps/api/core';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { FaCircle, FaEllipsisH, FaRobot, FaSatelliteDish } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';

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
    const { data: profile, isLoading: isLoadingProfile }: any = useGetProfile();
    const enabled = !isLoadingProfile && !!profile?.id;
    const { data: ownedRobots, isLoading: isLoadingOwnedRobots }: any = useGetOwnedRobots(profile?.id, enabled);
    const { data: selectedRobot } = useSelectedRobot();
    const { data: pairedConnections } = usePairedRobotConnections();
    const { data: connectionStatuses } = useRobotConnectionStatuses();

    const [isDiscovering, setIsDiscovering] = useState(false);
    const [isPairing, setIsPairing] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isStartingRobot, setIsStartingRobot] = useState(false);
    const [isStoppingRobot, setIsStoppingRobot] = useState(false);
    const [menuActionRobotId, setMenuActionRobotId] = useState<string | null>(null);
    const [deletingRobotId, setDeletingRobotId] = useState<string | null>(null);
    const [discoveredRobots, setDiscoveredRobots] = useState<DiscoveredRobot[]>([]);
    const [pairingCode, setPairingCode] = useState('');
    const [pairModalTarget, setPairModalTarget] = useState<PairModalTarget | null>(null);
    const [openMenuRobotId, setOpenMenuRobotId] = useState<string | null>(null);
    const selectedActionLockRef = useRef(false);

    const selectedRobotNickname = selectedRobot?.nickname || '';
    const selectedConnection = selectedRobotNickname ? pairedConnections?.[selectedRobotNickname] : null;
    const selectedConnectionStatus = selectedRobotNickname ? connectionStatuses?.[selectedRobotNickname] : null;
    const isSelectedConnected = !!selectedConnectionStatus?.connected;
    const isSelectedStarted = !!selectedConnectionStatus?.started;

    const normalizeNickname = (nickname: string) => (nickname.startsWith('@') ? nickname.slice(1) : nickname);
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const waitForRobotStartedState = async (
        connection: { host: string; port: number; token: string },
        expectedStarted: boolean,
        timeoutMs = 18000,
        pollMs = 700
    ) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const statusMessage = await invoke<string>('get_kiosk_robot_status', {
                host: connection.host,
                port: connection.port,
                token: connection.token,
            });
            const isStarted = statusMessage.trim().toLowerCase() === 'started';
            if (isStarted === expectedStarted) {
                return;
            }
            await sleep(pollMs);
        }
        throw new Error(expectedStarted ? 'Timed out waiting for robot to start.' : 'Timed out waiting for robot to stop.');
    };

    useEffect(() => {
        if (!openMenuRobotId) return;

        const handleOutsideClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('[data-robot-menu-root="true"]')) {
                setOpenMenuRobotId(null);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [openMenuRobotId]);

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
            setDiscoveredRobots(discovered);
            if (discovered.length === 0) {
                toast.error('No nearby robots discovered. Ensure robot kiosk is online and on the same Wi-Fi.', {
                    ...toastErrorDefaults,
                });
            }
        } catch (error: any) {
            toast.error(error?.message || 'Failed to discover robots.', { ...toastErrorDefaults });
        } finally {
            setIsDiscovering(false);
        }
    };

    const openPairModal = (target: PairModalTarget) => {
        setPairingCode('');
        setPairModalTarget(target);
        setOpenMenuRobotId(null);
    };

    const pairRobotWithTarget = async (target: PairModalTarget, code: string) => {
        if (!target.host || !code.trim()) {
            toast.error('Missing robot host or pairing code.', { ...toastErrorDefaults });
            return;
        }
        if (!profile?.id) {
            toast.error('Profile not loaded yet. Please wait and retry.', { ...toastErrorDefaults });
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
                const createdOwnedRobot: any = await addOwnedRobot(profile.id, matchedRobot.id, result.nickname);
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

            setSelectedRobot({
                id: ownedRobotId || `paired-${result.nickname}`,
                name: result.robot_name || matchedRobot?.name || 'Robot',
                nickname: result.nickname,
                robotType: result.robot_type || matchedRobot?.robot_type || 'unknown',
                image: matchedRobot?.image || null,
            });

            await queryClient.invalidateQueries({ queryKey: [BASE_OWNED_ROBOT_KEY] });
            toast.success(`Paired with ${result.robot_name} and added to your robots.`, { ...toastSuccessDefaults });
            setPairModalTarget(null);
            setPairingCode('');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to pair robot.', { ...toastErrorDefaults });
        } finally {
            setIsPairing(false);
        }
    };

    const handlePairFromModal = async () => {
        if (!pairModalTarget) return;
        await pairRobotWithTarget(pairModalTarget, pairingCode);
    };

    const handleOpenPairForOwnedRobot = (robot: any) => {
        const nickname = normalizeNickname(robot.nickname || '');
        const knownConnection = pairedConnections?.[nickname];
        const discoveredMatch =
            discoveredRobots.find((item) => item.nickname === nickname) ||
            discoveredRobots.find((item) => item.robot_name === robot.name);

        const host = knownConnection?.host || discoveredMatch?.host;
        const port = knownConnection?.port || discoveredMatch?.service_port;
        if (!host) {
            toast.error('No host known for this robot yet. Discover robots first, then pair.', { ...toastErrorDefaults });
            return;
        }

        openPairModal({
            host,
            servicePort: port,
            robotName: robot.name || 'Robot',
            nickname,
            robotType: robot.robotType || 'Unknown',
        });
    };

    const handleDeleteRobot = async (robot: any) => {
        if (!robot?.id) {
            toast.error('Could not delete robot: missing ID.', { ...toastErrorDefaults });
            return;
        }

        setDeletingRobotId(robot.id);
        setOpenMenuRobotId(null);
        try {
            await deleteOwnedRobot(robot.id);
            const nickname = normalizeNickname(robot.nickname || '');
            removePairedRobotConnection(nickname);
            removeRobotConnectionStatus(nickname);

            if (selectedRobot?.id === robot.id) {
                setSelectedRobot(null);
            }

            await queryClient.invalidateQueries({ queryKey: [BASE_OWNED_ROBOT_KEY] });
            toast.success('Robot deleted.', { ...toastSuccessDefaults });
        } catch (error: any) {
            toast.error(error?.message || 'Failed to delete robot.', { ...toastErrorDefaults });
        } finally {
            setDeletingRobotId(null);
        }
    };

    const handleConnectSelectedRobot = async () => {
        if (!selectedRobotNickname) {
            toast.error('Select a robot first.', { ...toastErrorDefaults });
            return;
        }
        if (!selectedConnection) {
            toast.error('Selected robot is not paired yet. Pair it first.', { ...toastErrorDefaults });
            return;
        }

        setIsConnecting(true);
        try {
            const message = await invoke<string>('check_kiosk_robot_connection', {
                host: selectedConnection.host,
                port: selectedConnection.port,
                token: selectedConnection.token,
            });

            const statusMessage = await invoke<string>('get_kiosk_robot_status', {
                host: selectedConnection.host,
                port: selectedConnection.port,
                token: selectedConnection.token,
            });
            const started = statusMessage.trim().toLowerCase() === 'started';

            setRobotConnectionStatus(selectedRobotNickname, {
                connected: true,
                started,
                checkedAt: Date.now(),
                message: started ? 'Robot is started' : message || 'Connected',
            });
            toast.success(message || 'Robot connected.', { ...toastSuccessDefaults });
        } catch (error: any) {
            setRobotConnectionStatus(selectedRobotNickname, {
                connected: false,
                started: false,
                checkedAt: Date.now(),
                message: error?.message || 'Disconnected',
            });
            toast.error(error?.message || 'Failed to connect to robot.', { ...toastErrorDefaults });
        } finally {
            setIsConnecting(false);
        }
    };

    const handleStartSelectedRobot = async () => {
        if (!selectedRobotNickname) {
            toast.error('Select a robot first.', { ...toastErrorDefaults });
            return;
        }
        if (!selectedConnection) {
            toast.error('Selected robot is not paired yet. Pair it first.', { ...toastErrorDefaults });
            return;
        }
        if (!isSelectedConnected) {
            toast.error('Connect to the robot before starting it.', { ...toastErrorDefaults });
            return;
        }

        setIsStartingRobot(true);
        try {
            const message = await invoke<string>('start_kiosk_robot', {
                host: selectedConnection.host,
                port: selectedConnection.port,
                token: selectedConnection.token,
            });
            await waitForRobotStartedState(selectedConnection, true);
            setRobotConnectionStatus(selectedRobotNickname, {
                connected: true,
                started: true,
                checkedAt: Date.now(),
                message: 'Robot is started',
            });
            toast.success(message || 'Robot start requested.', { ...toastSuccessDefaults });
        } catch (error: any) {
            toast.error(error?.message || 'Failed to start robot remotely.', { ...toastErrorDefaults });
        } finally {
            setIsStartingRobot(false);
        }
    };

    const handleStopSelectedRobot = async () => {
        if (!selectedRobotNickname) {
            toast.error('Select a robot first.', { ...toastErrorDefaults });
            return;
        }
        if (!selectedConnection) {
            toast.error('Selected robot is not paired yet. Pair it first.', { ...toastErrorDefaults });
            return;
        }
        if (!isSelectedConnected) {
            toast.error('Connect to the robot before stopping it.', { ...toastErrorDefaults });
            return;
        }

        setIsStoppingRobot(true);
        try {
            const message = await invoke<string>('stop_kiosk_robot', {
                host: selectedConnection.host,
                port: selectedConnection.port,
                token: selectedConnection.token,
            });
            await waitForRobotStartedState(selectedConnection, false);
            setRobotConnectionStatus(selectedRobotNickname, {
                connected: true,
                started: false,
                checkedAt: Date.now(),
                message: 'Robot is stopped',
            });
            toast.success(message || 'Robot stopped.', { ...toastSuccessDefaults });
        } catch (error: any) {
            toast.error(error?.message || 'Failed to stop robot remotely.', { ...toastErrorDefaults });
        } finally {
            setIsStoppingRobot(false);
        }
    };

    const handleToggleRobotFromCard = async (robot: any) => {
        const normalizedNickname = normalizeNickname(robot.nickname || '');
        const connection = pairedConnections?.[normalizedNickname];
        if (!connection) {
            toast.error('Robot is not paired yet. Pair it first.', { ...toastErrorDefaults });
            return;
        }

        setSelectedRobot({
            id: robot.id,
            name: robot.name || 'Robot',
            nickname: normalizedNickname,
            robotType: robot.robotType || 'unknown',
            image: robot.image || null,
        });

        setOpenMenuRobotId(null);
        setMenuActionRobotId(robot.id);
        try {
            const statusMessage = await invoke<string>('get_kiosk_robot_status', {
                host: connection.host,
                port: connection.port,
                token: connection.token,
            });
            const started = statusMessage.trim().toLowerCase() === 'started';
            setRobotConnectionStatus(normalizedNickname, {
                connected: true,
                started,
                checkedAt: Date.now(),
                message: started ? 'Robot is started' : 'Robot is stopped',
            });

            if (started) {
                const message = await invoke<string>('stop_kiosk_robot', {
                    host: connection.host,
                    port: connection.port,
                    token: connection.token,
                });
                await waitForRobotStartedState(connection, false);
                setRobotConnectionStatus(normalizedNickname, {
                    connected: true,
                    started: false,
                    checkedAt: Date.now(),
                    message: 'Robot is stopped',
                });
                toast.success(message || 'Robot stopped.', { ...toastSuccessDefaults });
            } else {
                const message = await invoke<string>('start_kiosk_robot', {
                    host: connection.host,
                    port: connection.port,
                    token: connection.token,
                });
                await waitForRobotStartedState(connection, true);
                setRobotConnectionStatus(normalizedNickname, {
                    connected: true,
                    started: true,
                    checkedAt: Date.now(),
                    message: 'Robot is started',
                });
                toast.success(message || 'Robot start requested.', { ...toastSuccessDefaults });
            }
        } catch (error: any) {
            setRobotConnectionStatus(normalizedNickname, {
                connected: false,
                started: false,
                checkedAt: Date.now(),
                message: error?.message || 'Disconnected',
            });
            toast.error(error?.message || 'Failed to update robot state.', { ...toastErrorDefaults });
        } finally {
            setMenuActionRobotId(null);
        }
    };

    const handleConnectOrStart = async () => {
        if (selectedActionLockRef.current) return;
        selectedActionLockRef.current = true;
        try {
            if (!isSelectedConnected) {
                await handleConnectSelectedRobot();
                return;
            }
            if (isSelectedStarted) {
                await handleStopSelectedRobot();
            } else {
                await handleStartSelectedRobot();
            }
        } finally {
            selectedActionLockRef.current = false;
        }
    };

    const connectedRobots = (ownedRobots || []).map((ownedRobot: any) => {
        const rawNickname = ownedRobot?.owned_robot?.nickname || ownedRobot?.nickname || '';
        const normalizedNickname = normalizeNickname(rawNickname);
        const paired = !!pairedConnections?.[normalizedNickname];
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
        };
    });
    const robotsToRender = connectedRobots;

    return (
        <div className="min-h-screen bg-slate-900/30 p-8">
            <div className="mx-auto max-w-7xl">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-white">Robots</h1>
                    <p className="mt-2 text-slate-300">Discover, pair, and manage your nearby robots.</p>
                </div>

                <div className="mb-6 rounded-xl border border-slate-700 bg-slate-800/70 p-5">
                    <div className="mb-4 flex items-center gap-3">
                        <FaSatelliteDish className="h-5 w-5 text-blue-400" />
                        <h2 className="text-lg font-semibold text-white">Pair A Nearby Robot</h2>
                    </div>

                    <div className="mb-4 flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleDiscoverRobots}
                            disabled={isDiscovering}
                            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                                isDiscovering
                                    ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                                    : 'cursor-pointer bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                        >
                            {isDiscovering ? 'Discovering...' : 'Discover Robots'}
                        </button>
                        <span className="text-sm text-slate-400">
                            {discoveredRobots.length > 0 ? `${discoveredRobots.length} robot(s) found` : 'No discovery results yet'}
                        </span>
                    </div>

                    {discoveredRobots.length > 0 && (
                        <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                            {discoveredRobots.map((robot) => (
                                <button
                                    key={`${robot.host}-${robot.nickname}`}
                                    type="button"
                                    onClick={() =>
                                        openPairModal({
                                            host: robot.host,
                                            servicePort: robot.service_port,
                                            robotName: robot.robot_name,
                                            nickname: robot.nickname,
                                            robotType: robot.robot_type,
                                        })
                                    }
                                    className="cursor-pointer rounded-lg border border-slate-600 bg-slate-700/40 px-3 py-2 text-left text-sm text-slate-300 transition-all hover:bg-slate-700/70"
                                >
                                    <div className="font-semibold text-white">{robot.robot_name}</div>
                                    <div className="text-xs text-slate-400">
                                        {robot.host} | @{robot.nickname} | {robot.robot_type}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {selectedRobot && (
                        <div className="mt-4 rounded-lg border border-slate-600 bg-slate-700/30 p-3">
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    onClick={handleConnectOrStart}
                                    disabled={!selectedConnection || isConnecting || isStartingRobot || isStoppingRobot}
                                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                                        !selectedConnection || isConnecting || isStartingRobot || isStoppingRobot
                                            ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                                            : isSelectedConnected && isSelectedStarted
                                              ? 'cursor-pointer bg-red-600 text-white hover:bg-red-700'
                                              : isSelectedConnected
                                                ? 'cursor-pointer bg-green-600 text-white hover:bg-green-700'
                                              : 'cursor-pointer bg-cyan-600 text-white hover:bg-cyan-700'
                                    }`}
                                >
                                    {isConnecting
                                        ? 'Connecting...'
                                        : isStartingRobot
                                          ? 'Starting...'
                                          : isStoppingRobot
                                            ? 'Stopping...'
                                            : isSelectedConnected
                                              ? isSelectedStarted
                                                ? 'Stop Robot'
                                                : 'Start Robot'
                                              : 'Connect'}
                                </button>
                                <span className={`text-sm ${isSelectedConnected ? 'text-green-300' : 'text-slate-300'}`}>
                                    Selected: {selectedRobot.name} | Status:{' '}
                                    {isSelectedConnected ? (isSelectedStarted ? 'Connected and started' : 'Connected and stopped') : 'Not connected'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {isLoadingOwnedRobots ? (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-[420px] animate-pulse rounded-2xl border border-slate-700 bg-slate-800/60" />
                        ))}
                    </div>
                ) : robotsToRender.length === 0 ? (
                    <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-8 text-center text-slate-300">
                        No robots yet. Discover and pair a nearby robot to get started.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                        {robotsToRender.map((robot: any) => {
                            const robotName = robot.name || 'Robot';
                            const nickname = robot.nickname || '';
                            const image = robot.image;
                            const cardIsBusy = menuActionRobotId === robot.id;

                            return (
                                <div
                                    key={robot.id}
                                    className={`relative w-full overflow-hidden rounded-2xl border bg-slate-800 text-left transition-all duration-200 hover:scale-[1.02] ${
                                        selectedRobot?.id === robot.id ? 'border-yellow-400/70 shadow-lg shadow-yellow-500/10' : 'border-slate-700'
                                    }`}
                                >
                                    <div className="absolute top-3 left-3 z-20">
                                        <FaCircle className={`h-2.5 w-2.5 ${robot.isStarted ? 'text-green-400' : 'text-slate-500'}`} />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedRobot({
                                                id: robot.id,
                                                name: robotName,
                                                nickname: normalizeNickname(nickname),
                                                robotType: robot.robotType || 'unknown',
                                                image,
                                            });
                                            setOpenMenuRobotId(null);
                                        }}
                                        className="w-full cursor-pointer text-left"
                                    >
                                        <div className="px-3 pt-10 pb-3">
                                            <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-slate-600 bg-slate-750">
                                                {image ? (
                                                    <Image
                                                        src={image}
                                                        alt={robotName}
                                                        fill
                                                        className="object-cover"
                                                        sizes="(max-width: 640px) 100vw, 25vw"
                                                    />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-700">
                                                        <FaRobot className="h-16 w-16 text-slate-500" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-2 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-lg font-semibold text-white">{robotName}</div>
                                                <span
                                                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                                        robot.isStarted
                                                            ? 'bg-red-600/20 text-red-300'
                                                            : 'bg-green-600/20 text-green-300'
                                                    }`}
                                                >
                                                    {robot.isStarted ? 'Running' : robot.source}
                                                </span>
                                            </div>
                                            <div className="text-sm text-slate-300">
                                                <span className="font-semibold text-slate-200">Nickname:</span> {nickname || 'N/A'}
                                            </div>
                                            <div className="text-sm text-slate-300">
                                                <span className="font-semibold text-slate-200">Type:</span> {robot.robotType}
                                            </div>
                                            <div className="text-sm text-slate-300">
                                                <span className="font-semibold text-slate-200">Status:</span> Ready
                                            </div>
                                        </div>
                                    </button>

                                    <div className="absolute -top-px -right-px z-20" data-robot-menu-root="true">
                                        <button
                                            type="button"
                                            onMouseDown={(event) => {
                                                event.preventDefault();
                                            }}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setOpenMenuRobotId(openMenuRobotId === robot.id ? null : robot.id);
                                            }}
                                            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-tr-[1rem] rounded-bl-lg border border-slate-700/70 bg-slate-900/90 p-0 leading-none text-slate-200 transition-colors hover:bg-slate-700 focus:outline-none focus:ring-0 focus-visible:ring-0 active:translate-y-0"
                                        >
                                            <FaEllipsisH className="h-4 w-4" />
                                        </button>
                                        {openMenuRobotId === robot.id && (
                                            <div className="absolute top-full right-0 mt-2 w-36 rounded-lg border border-slate-600 bg-slate-900/95 p-1 shadow-xl">
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleOpenPairForOwnedRobot(robot);
                                                    }}
                                                    className="block w-full cursor-pointer rounded px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700"
                                                >
                                                    Pair
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleToggleRobotFromCard(robot);
                                                    }}
                                                    disabled={cardIsBusy}
                                                    className={`block w-full rounded px-3 py-2 text-left text-sm ${
                                                        cardIsBusy
                                                            ? 'cursor-not-allowed text-slate-400 opacity-60'
                                                            : robot.isStarted
                                                              ? 'cursor-pointer text-red-400 hover:bg-red-900/40'
                                                              : 'cursor-pointer text-emerald-300 hover:bg-emerald-900/30'
                                                    }`}
                                                >
                                                    {cardIsBusy ? 'Working...' : robot.isStarted ? 'Stop Robot' : 'Start Robot'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleDeleteRobot(robot);
                                                    }}
                                                    disabled={deletingRobotId === robot.id}
                                                    className="block w-full cursor-pointer rounded px-3 py-2 text-left text-sm text-red-400 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {deletingRobotId === robot.id ? 'Deleting...' : 'Delete'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
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
                        className="w-full max-w-md rounded-xl border border-slate-600 bg-slate-800 p-5 shadow-2xl"
                    >
                        <h3 className="text-lg font-semibold text-white">Pair Robot</h3>
                        <p className="mt-1 text-sm text-slate-300">
                            {pairModalTarget.robotName} | @{pairModalTarget.nickname}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                            Host: {pairModalTarget.host} | Type: {pairModalTarget.robotType}
                        </p>

                        <input
                            value={pairingCode}
                            onChange={(event) => setPairingCode(event.target.value)}
                            placeholder="Enter 6-digit pairing code"
                            className="mt-4 w-full rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
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
