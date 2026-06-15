'use client';

import { discoverLanRobots } from '@/api/Local/Robot/discovery';
import { GeneralModal } from '@/components/Elements/Modals/GeneralModal';
import { Spinner } from '@/components/Elements/Spinner';
import type { DiscoveredLanRobot } from '@/types/robots/lan-discovery';
import { toastErrorDefaults } from '@/utils/toast/toast-utils';
import { useEffect, useState } from 'react';
import { FaCompass, FaNetworkWired, FaRedo } from 'react-icons/fa';
import { toast } from 'react-toastify';

type DiscoverLanRobotsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSelectRobot: (robot: DiscoveredLanRobot) => void;
};

type DiscoverState = {
    hosts: DiscoveredLanRobot[];
    localIp: string;
    subnet: string;
    message?: string | null;
};

const EMPTY_STATE: DiscoverState = {
    hosts: [],
    localIp: '',
    subnet: '',
    message: null,
};

export const DiscoverLanRobotsModal = ({ isOpen, onClose, onSelectRobot }: DiscoverLanRobotsModalProps) => {
    const [state, setState] = useState<DiscoverState>(EMPTY_STATE);
    const [isDiscovering, setIsDiscovering] = useState(false);

    const runDiscovery = async () => {
        setIsDiscovering(true);
        try {
            const result = await discoverLanRobots();
            setState({
                hosts: result.hosts,
                localIp: result.localIp,
                subnet: result.subnet,
                message: result.message,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to scan the local network.';
            toast.error(message, { ...toastErrorDefaults });
            setState(EMPTY_STATE);
        } finally {
            setIsDiscovering(false);
        }
    };

    useEffect(() => {
        if (!isOpen) {
            setState(EMPTY_STATE);
            setIsDiscovering(false);
            return;
        }

        void runDiscovery();
    }, [isOpen]);

    return (
        <GeneralModal isOpen={isOpen} onClose={() => !isDiscovering && onClose()} title="Discover Robots on This LAN" size="lg">
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4 text-sm text-slate-300">
                Discovery sends the Sourccey LAN broadcast and waits for robots to announce themselves back. This matches the older
                desktop discovery flow instead of scanning generic SSH hosts.
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current Network</div>
                    <div className="mt-1 text-sm text-white">
                        {state.localIp ? `${state.localIp} scanning ${state.subnet}` : 'Looking up your desktop LAN address...'}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => void runDiscovery()}
                    disabled={isDiscovering}
                    className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                        isDiscovering
                            ? 'cursor-not-allowed border-slate-700 text-slate-500'
                            : 'cursor-pointer border-slate-600 text-slate-100 hover:border-slate-400'
                    }`}
                >
                    {isDiscovering ? <Spinner color="white" width="w-4" height="h-4" /> : <FaRedo className="h-4 w-4" />}
                    {isDiscovering ? 'Scanning...' : 'Scan Again'}
                </button>
            </div>

            {isDiscovering ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-slate-700/60 bg-slate-900/30 text-slate-300">
                    <Spinner color="yellow" width="w-6" height="h-6" />
                    <div className="text-sm font-semibold">Searching your LAN for reachable robots...</div>
                </div>
            ) : state.hosts.length === 0 ? (
                <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-6 text-center text-sm text-slate-300">
                    <FaCompass className="mx-auto mb-3 h-5 w-5 text-amber-300" />
                    <div className="font-semibold text-white">No robots were detected on this scan.</div>
                    <p className="mt-2">{state.message ?? 'You can still add the robot manually if you already know its LAN IP address.'}</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {state.hosts.map((robot) => (
                        <div
                            key={robot.ipAddress}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4"
                        >
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
                                    <FaNetworkWired className="h-4 w-4" />
                                </div>
                                <div>
                                    <div className="text-base font-semibold text-white">{robot.robotName || robot.ipAddress}</div>
                                    <div className="mt-1 text-sm text-slate-300">
                                        {robot.nickname ? `@${robot.nickname} on ` : ''}{robot.ipAddress} with ZMQ cmd {robot.commandPort} and obs {robot.observationPort}.
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => onSelectRobot(robot)}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-emerald-500/90 hover:to-teal-500/90"
                            >
                                Use This Host
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </GeneralModal>
    );
};
