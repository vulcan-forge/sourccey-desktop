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
    onSelectRobot: (robot: DiscoveredLanRobot) => Promise<void> | void;
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
    const [pendingRobotIp, setPendingRobotIp] = useState<string | null>(null);

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
            setPendingRobotIp(null);
            return;
        }

        void runDiscovery();
    }, [isOpen]);

    return (
        <GeneralModal isOpen={isOpen} onClose={() => !isDiscovering && onClose()} title="Discover Robots on This LAN" size="lg">
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4 text-sm text-slate-300">
                Discovery sends the Sourccey LAN broadcast and waits for kiosk devices on your local network to reply. A robot can show
                up here even if its host process is currently stopped.
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
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="text-base font-semibold text-white">{robot.robotName || robot.ipAddress}</div>
                                        <div
                                            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                                (robot.hostRunning ?? true)
                                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                                                    : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                                            }`}
                                        >
                                            {(robot.hostRunning ?? true) ? 'Running' : 'Stopped'}
                                        </div>
                                    </div>
                                    <div className="mt-1 text-sm text-slate-300">
                                        {robot.nickname ? `@${robot.nickname} on ` : ''}{robot.ipAddress} with ZMQ cmd {robot.commandPort} and obs {robot.observationPort}.
                                    </div>
                                    <div className="mt-1 text-xs text-slate-400">
                                        {(robot.hostRunning ?? true)
                                            ? 'Robot host is running and ready for LAN control.'
                                            : 'Robot host is stopped right now, but you can still save this LAN address.'}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={async () => {
                                    setPendingRobotIp(robot.ipAddress);
                                    try {
                                        await onSelectRobot(robot);
                                    } finally {
                                        setPendingRobotIp((current) => (current === robot.ipAddress ? null : current));
                                    }
                                }}
                                disabled={pendingRobotIp === robot.ipAddress}
                                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
                                    pendingRobotIp === robot.ipAddress
                                        ? 'cursor-not-allowed bg-slate-600'
                                        : 'cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-500/90 hover:to-teal-500/90'
                                }`}
                            >
                                {pendingRobotIp === robot.ipAddress ? 'Adding...' : 'Add Robot'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </GeneralModal>
    );
};
