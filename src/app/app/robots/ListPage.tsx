'use client';

import { addOwnedRobot, getOwnedRobotByNickname } from '@/api/Local/Robot/owned_robot';
import { getAllRobots } from '@/api/Local/Robot/robot';
import { queryClient } from '@/hooks/default';
import { BASE_OWNED_ROBOT_KEY, useGetOwnedRobots } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import { useGetProfile } from '@/hooks/Models/Profile/profile.hook';
import { setPairedRobotConnection, usePairedRobotConnections } from '@/hooks/Robot/paired-robot-connection.hook';
import { setSelectedRobot, useSelectedRobot } from '@/hooks/Robot/selected-robot.hook';
import { invoke } from '@tauri-apps/api/core';
import Image from 'next/image';
import { useState } from 'react';
import { FaRobot, FaSatelliteDish } from 'react-icons/fa';
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

const DEMO_ROBOTS = [
    { id: 'demo-1', name: 'Atlas Mini', nickname: '@atlas_mini', image: '/assets/logo/SourcceyLogo.png' },
    { id: 'demo-2', name: 'Nova Arm', nickname: '@nova_arm', image: '/assets/logo/SourcceyLogo.png' },
    { id: 'demo-3', name: 'Cargo Rover', nickname: '@cargo_rover', image: '/assets/logo/SourcceyLogo.png' },
    { id: 'demo-4', name: 'Echo Pilot', nickname: '@echo_pilot', image: '/assets/logo/SourcceyLogo.png' },
    { id: 'demo-5', name: 'Forge Twin', nickname: '@forge_twin', image: '/assets/logo/SourcceyLogo.png' },
    { id: 'demo-6', name: 'Lumen Bot', nickname: '@lumen_bot', image: '/assets/logo/SourcceyLogo.png' },
    { id: 'demo-7', name: 'Delta Reach', nickname: '@delta_reach', image: '/assets/logo/SourcceyLogo.png' },
    { id: 'demo-8', name: 'Orbit Rig', nickname: '@orbit_rig', image: '/assets/logo/SourcceyLogo.png' },
];

export const RobotListPage = () => {
    const { data: profile, isLoading: isLoadingProfile }: any = useGetProfile();
    const enabled = !isLoadingProfile && !!profile?.id;
    const { data: ownedRobots, isLoading: isLoadingOwnedRobots }: any = useGetOwnedRobots(profile?.id, enabled);
    const { data: selectedRobot } = useSelectedRobot();
    const { data: pairedConnections } = usePairedRobotConnections();

    const [isDiscovering, setIsDiscovering] = useState(false);
    const [isPairing, setIsPairing] = useState(false);
    const [discoveredRobots, setDiscoveredRobots] = useState<DiscoveredRobot[]>([]);
    const [selectedHost, setSelectedHost] = useState('');
    const [pairingCode, setPairingCode] = useState('');

    const handleDiscoverRobots = async () => {
        setIsDiscovering(true);
        try {
            const discovered = await invoke<DiscoveredRobot[]>('discover_pairable_robots', { timeout_ms: 1400 });
            setDiscoveredRobots(discovered);
            if (discovered.length > 0) {
                setSelectedHost(discovered[0]?.host ?? '');
            }
            if (discovered.length === 0) {
                toast.error('No nearby robots discovered. Ensure robot kiosk is online and on the same Wi-Fi.', { ...toastErrorDefaults });
            }
        } catch (error: any) {
            toast.error(error?.message || 'Failed to discover robots.', { ...toastErrorDefaults });
        } finally {
            setIsDiscovering(false);
        }
    };

    const handlePairRobot = async () => {
        if (!selectedHost || !pairingCode.trim()) {
            toast.error('Select a discovered robot and enter pairing code.', { ...toastErrorDefaults });
            return;
        }
        if (!profile?.id) {
            toast.error('Profile not loaded yet. Please wait and retry.', { ...toastErrorDefaults });
            return;
        }

        setIsPairing(true);
        try {
            const result = await invoke<PairResult>('pair_with_kiosk_robot', {
                host: selectedHost,
                code: pairingCode.trim(),
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
                host: selectedHost,
                port: result.service_port,
                token: result.token,
                robotType: result.robot_type,
                robotName: result.robot_name,
                pairedAt: Date.now(),
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
            setPairingCode('');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to pair robot.', { ...toastErrorDefaults });
        } finally {
            setIsPairing(false);
        }
    };

    const connectedRobots = (ownedRobots || []).map((ownedRobot: any) => {
        const nickname = ownedRobot?.owned_robot?.nickname || ownedRobot?.nickname || '';
        const paired = !!pairedConnections?.[nickname];
        return {
            id: ownedRobot?.owned_robot?.id || ownedRobot.id,
            name: ownedRobot?.robot?.name || 'Robot',
            nickname: nickname ? `@${nickname}` : '',
            image: ownedRobot?.robot?.image || null,
            robotType: ownedRobot?.robot?.robot_type || 'Unknown',
            source: paired ? 'Paired' : 'Connected',
            isDemo: false,
        };
    });

    const robotsToRender = [...connectedRobots, ...DEMO_ROBOTS.map((r) => ({ ...r, robotType: 'Demo Unit', source: 'Demo', isDemo: true }))].slice(0, 8);

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
                            {discoveredRobots.length > 0
                                ? `${discoveredRobots.length} robot(s) found`
                                : 'No discovery results yet'}
                        </span>
                    </div>

                    {discoveredRobots.length > 0 && (
                        <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                            {discoveredRobots.map((robot) => (
                                <button
                                    key={`${robot.host}-${robot.nickname}`}
                                    type="button"
                                    onClick={() => setSelectedHost(robot.host)}
                                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                                        selectedHost === robot.host
                                            ? 'border-blue-400 bg-blue-500/10 text-white'
                                            : 'border-slate-600 bg-slate-700/40 text-slate-300 hover:bg-slate-700/70'
                                    }`}
                                >
                                    <div className="font-semibold">{robot.robot_name}</div>
                                    <div className="text-xs text-slate-400">
                                        {robot.host} | @{robot.nickname} | {robot.robot_type}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-col gap-3 md:flex-row">
                        <input
                            value={pairingCode}
                            onChange={(event) => setPairingCode(event.target.value)}
                            placeholder="Enter 6-digit pairing code shown on robot"
                            className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                        />
                        <button
                            onClick={handlePairRobot}
                            disabled={!selectedHost || !pairingCode.trim() || isPairing}
                            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                                !selectedHost || !pairingCode.trim() || isPairing
                                    ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                                    : 'cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                        >
                            {isPairing ? 'Pairing...' : 'Pair And Add Robot'}
                        </button>
                    </div>
                </div>

                {isLoadingOwnedRobots ? (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-[420px] animate-pulse rounded-2xl border border-slate-700 bg-slate-800/60" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                        {robotsToRender.map((robot) => {
                            const robotName = robot.name || 'Robot';
                            const nickname = robot.nickname || '';
                            const image = robot.image;

                            return (
                                <button
                                    key={robot.id}
                                    type="button"
                                    onClick={() =>
                                        setSelectedRobot({
                                            id: robot.id,
                                            name: robotName,
                                            nickname: nickname.startsWith('@') ? nickname.slice(1) : nickname,
                                            robotType: robot.robotType || 'unknown',
                                            image,
                                        })
                                    }
                                    className={`w-full cursor-pointer overflow-hidden rounded-2xl border bg-slate-800 text-left transition-all duration-200 hover:scale-[1.02] ${
                                        selectedRobot?.id === robot.id ? 'border-yellow-400/70 shadow-lg shadow-yellow-500/10' : 'border-slate-700'
                                    }`}
                                >
                                    <div className="p-3">
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
                                                    robot.isDemo ? 'bg-slate-700 text-slate-200' : 'bg-green-600/20 text-green-300'
                                                }`}
                                            >
                                                {robot.source}
                                            </span>
                                        </div>
                                        <div className="text-sm text-slate-300">
                                            <span className="font-semibold text-slate-200">Nickname:</span> {nickname || 'N/A'}
                                        </div>
                                        <div className="text-sm text-slate-300">
                                            <span className="font-semibold text-slate-200">Type:</span> {robot.robotType}
                                        </div>
                                        <div className="text-sm text-slate-300">
                                            <span className="font-semibold text-slate-200">Status:</span>{' '}
                                            {robot.isDemo ? 'Preview model' : 'Ready'}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
