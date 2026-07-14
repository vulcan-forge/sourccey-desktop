'use client';

import { useMemo, useState } from 'react';
import { FaCheckCircle, FaChevronDown, FaChevronUp, FaCloud } from 'react-icons/fa';
import { DEFAULT_PRODUCTION_API_BASE_URL, DEFAULT_PRODUCTION_PORTAL_BASE_URL, type KioskCloudPairingInfo } from './welcome.types';

interface WelcomeRegistrationSectionProps {
    cloudPairing: KioskCloudPairingInfo | null;
    isLoadingCloudPairing: boolean;
    nowMs: number;
    onRefresh: () => void;
}

const LoadingLine = ({ className = '' }: { className?: string }) => <div className={`skeleton-shimmer rounded-full ${className}`} />;

export const WelcomeRegistrationSection = ({ cloudPairing, isLoadingCloudPairing, nowMs, onRefresh }: WelcomeRegistrationSectionProps) => {
    const [showClaimedRegistrationInfo, setShowClaimedRegistrationInfo] = useState(false);
    const isInitialCloudPairingLoad = isLoadingCloudPairing && !cloudPairing;

    const registrationActionLabel =
        cloudPairing?.status === 'claimed' ? 'Refresh Status' : cloudPairing?.pairingCode ? 'Refresh Code' : 'Start Registration';
    const portalUrlDisplay = cloudPairing?.portalBaseUrl || DEFAULT_PRODUCTION_PORTAL_BASE_URL;
    const isRegistered = cloudPairing?.status === 'claimed';
    const isRegistrationPending = cloudPairing?.status === 'pending' || Boolean(cloudPairing?.pairingCode);

    const cloudCountdown = useMemo(() => {
        if (!cloudPairing?.expiresAtMs) return null;
        const remainingMs = cloudPairing.expiresAtMs - nowMs;
        if (remainingMs <= 0) return 'Refreshing code...';
        const totalSeconds = Math.floor(remainingMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `Expires in ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, [cloudPairing?.expiresAtMs, nowMs]);

    return (
        <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-xl font-semibold text-white">
                        <FaCloud className="h-5 w-5 text-sky-300" />
                        Register Robot
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                        Start cloud registration here, then enter the pairing code in the Vulcan portal to claim this robot.
                    </p>
                </div>
                <div className="flex flex-col items-end gap-3">
                    <div className="inline-flex min-w-[11rem] items-center justify-center gap-2 rounded-full border border-slate-600 bg-slate-800/70 px-4 py-1 text-sm whitespace-nowrap">
                        {isRegistered ? (
                            <>
                                <FaCheckCircle className="h-4 w-4 text-emerald-300" />
                                <span className="font-semibold text-emerald-200">Robot registered</span>
                            </>
                        ) : (
                            <>
                                <FaCloud className="h-4 w-4 text-sky-300" />
                                <span className="font-semibold text-sky-100">Awaiting registration</span>
                            </>
                        )}
                    </div>
                    <button
                        onClick={onRefresh}
                        disabled={isLoadingCloudPairing}
                        className="cursor-pointer rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold whitespace-nowrap text-slate-100 transition hover:border-slate-400 disabled:cursor-default disabled:opacity-70"
                    >
                        {isInitialCloudPairingLoad
                            ? 'Checking Status...'
                            : isLoadingCloudPairing
                              ? 'Contacting API...'
                              : registrationActionLabel}
                    </button>
                </div>
            </div>

            <div className="mb-5 grid gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-sm text-slate-300 md:grid-cols-3">
                <div>
                    <div className="font-semibold text-white">1. Start registration</div>
                    <div className="mt-1 text-slate-400">Generate a short-lived pairing code for this robot.</div>
                </div>
                <div>
                    <div className="font-semibold text-white">2. Sign in to Vulcan</div>
                    <div className="mt-1 text-slate-400">Open Studio, sign in, and choose the robot registration flow.</div>
                </div>
                <div>
                    <div className="font-semibold text-white">3. Enter the code</div>
                    <div className="mt-1 text-slate-400">Once claimed, this kiosk will automatically show that the robot is registered.</div>
                </div>
            </div>

            <div className="mb-5 rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-3">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Studio URL</div>
                <div className="mt-2 font-mono text-sm break-all text-sky-200">{portalUrlDisplay}</div>
            </div>

            {isInitialCloudPairingLoad ? (
                <div className="space-y-4">
                    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                        <LoadingLine className="h-4 w-56 bg-slate-700/70" />
                        <LoadingLine className="mt-3 h-3 w-full max-w-xl bg-slate-700/60" />
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        <LoadingLine className="h-3 w-28 bg-slate-700/60" />
                        <LoadingLine className="h-3 w-24 bg-slate-700/50" />
                        <LoadingLine className="h-3 w-36 bg-slate-700/50" />
                    </div>
                </div>
            ) : !cloudPairing && !isLoadingCloudPairing ? (
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-sm text-slate-300">
                    Click <span className="font-semibold text-white">Start Registration</span> to generate a pairing code for this robot.
                </div>
            ) : cloudPairing?.status === 'claimed' ? (
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => setShowClaimedRegistrationInfo((current) => !current)}
                        className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-left transition hover:border-emerald-400/50"
                    >
                        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                            <FaCheckCircle className="h-4 w-4" />
                            Registered in Vulcan Cloud
                        </div>
                        {showClaimedRegistrationInfo ? (
                            <FaChevronUp className="h-3 w-3 text-emerald-200" />
                        ) : (
                            <FaChevronDown className="h-3 w-3 text-emerald-200" />
                        )}
                    </button>
                    {showClaimedRegistrationInfo ? (
                        <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/40 p-4">
                            <div className="text-sm text-slate-300">
                                This robot has been successfully registered and claimed in{' '}
                                <span className="font-semibold text-white">{portalUrlDisplay}</span>.
                            </div>
                            <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-3">
                                <div>
                                    <div className="text-slate-400">Environment</div>
                                    <div className="mt-1 font-semibold text-white">{cloudPairing.environment || 'production'}</div>
                                </div>
                                <div>
                                    <div className="text-slate-400">Device ID</div>
                                    <div className="font-mono text-xs text-white">{cloudPairing.deviceId || 'Unavailable'}</div>
                                </div>
                                <div>
                                    <div className="text-slate-400">Owned Robot ID</div>
                                    <div className="font-mono text-xs text-white">{cloudPairing.ownedRobotId || 'Pending sync'}</div>
                                </div>
                                <div>
                                    <div className="text-slate-400">Robot Model</div>
                                    <div className="text-white">{cloudPairing.robotModelName}</div>
                                </div>
                                <div>
                                    <div className="text-slate-400">Cloud Host</div>
                                    <div className="text-white">{portalUrlDisplay}</div>
                                </div>
                                <div>
                                    <div className="text-slate-400">API URL</div>
                                    <div className="font-mono text-xs break-all text-white">
                                        {cloudPairing.apiBaseUrl || DEFAULT_PRODUCTION_API_BASE_URL}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : isRegistrationPending ? (
                <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1 text-sm font-semibold text-sky-200">
                        <FaCloud className="h-4 w-4" />
                        Registration in progress
                    </div>
                    <div className="text-sm text-slate-300">
                        Open <span className="font-semibold text-white">{portalUrlDisplay}</span>, sign in, and enter this pairing code.
                    </div>
                    <div className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-5 text-center font-mono text-4xl font-bold tracking-[0.18em] text-white">
                        {cloudPairing?.pairingCode || '------'}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                        <span>{cloudCountdown || 'Waiting for a fresh code...'}</span>
                        <span>Model: {cloudPairing?.robotModelName || 'sourccey'}</span>
                        <span className="font-mono text-xs">Device: {cloudPairing?.deviceId || 'Generating...'}</span>
                    </div>
                    {cloudPairing?.errorMessage ? (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                            {cloudPairing.errorMessage}
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-sm text-slate-300">
                        Click <span className="font-semibold text-white">Start Registration</span> to generate a pairing code for this robot.
                    </div>
                    {cloudPairing?.errorMessage ? (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                            {cloudPairing.errorMessage}
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
};
