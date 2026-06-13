'use client';

import { useMemo } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { FaBug, FaExclamationTriangle, FaSyncAlt } from 'react-icons/fa';
import { Spinner } from '@/components/Elements/Spinner';
import { useCalibrationDebugLogs } from '@/hooks/Control/calibration-debug-logs.hook';

const CALIBRATION_KEYWORDS = [
    'calibration',
    'auto calibrate',
    'auto_calibrate',
    'teleoperator',
    'traceback',
    'exception',
    'python script failed',
    'failed',
    'error',
    'stderr',
    'stdout',
    'motor',
    'port',
    'disconnect',
    'disconnected',
    'not connected',
    'missing',
    'dxl',
];

const HIGH_SIGNAL_KEYWORDS = [
    'disconnected',
    'disconnect',
    'not connected',
    'missing',
    'failed',
    'error',
    'exception',
    'traceback',
    'timeout',
    'unavailable',
    'unable',
    'not found',
    'dxl',
];

type CalibrationDebugLogsProps = {
    nickname?: string;
    robotType?: string;
    teleopType?: string;
    leftArmPort?: string;
    rightArmPort?: string;
    isRunning?: boolean;
};

const normalizeToken = (value?: string) => value?.trim().toLowerCase() ?? '';

const matchesAny = (line: string, values: string[]) => {
    const lower = line.toLowerCase();
    return values.some((value) => value.length > 0 && lower.includes(value));
};

const getHighSignalTone = (line: string) => {
    const lower = line.toLowerCase();
    if (
        lower.includes('disconnected') ||
        lower.includes('not connected') ||
        lower.includes('missing') ||
        lower.includes('unavailable')
    ) {
        return 'border-red-500/30 bg-red-500/10 text-red-100';
    }

    if (
        lower.includes('failed') ||
        lower.includes('error') ||
        lower.includes('exception') ||
        lower.includes('traceback') ||
        lower.includes('timeout')
    ) {
        return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
    }

    return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100';
};

export const CalibrationDebugLogs = ({
    nickname,
    robotType,
    teleopType,
    leftArmPort,
    rightArmPort,
    isRunning = false,
}: CalibrationDebugLogsProps) => {
    const tauriAvailable = isTauri();
    const {
        data: allLogs = [],
        isLoading,
        isFetching,
        error,
        refetch,
    } = useCalibrationDebugLogs({
        enabled: tauriAvailable,
        maxLines: 400,
        maxLinesPerFile: 200,
        refetchIntervalMs: isRunning ? 2000 : false,
    });

    const contextTokens = useMemo(() => {
        const tokens = [
            normalizeToken(nickname),
            normalizeToken(robotType),
            normalizeToken(teleopType),
            normalizeToken(leftArmPort),
            normalizeToken(rightArmPort),
        ].filter(Boolean);

        return Array.from(new Set(tokens));
    }, [leftArmPort, nickname, rightArmPort, robotType, teleopType]);

    const recentRelevantLogs = useMemo(() => {
        const recent = allLogs.slice(-300);
        const contextMatches = recent.filter((line) => matchesAny(line, contextTokens));

        const filtered = recent.filter((line) => {
            if (contextMatches.length > 0 && matchesAny(line, contextTokens)) {
                return true;
            }

            return matchesAny(line, CALIBRATION_KEYWORDS);
        });

        return filtered.slice(-80);
    }, [allLogs, contextTokens]);

    const highSignalLogs = useMemo(() => {
        const source = recentRelevantLogs.length > 0 ? recentRelevantLogs : allLogs.slice(-120);
        return source.filter((line) => matchesAny(line, HIGH_SIGNAL_KEYWORDS)).slice(-8);
    }, [allLogs, recentRelevantLogs]);

    const errorMessage = error instanceof Error ? error.message : error ? String(error) : '';

    return (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                        <FaBug className="h-4 w-4 text-cyan-300" />
                        Calibration Debug Logs
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                        Focused recent logs for calibration, ports, and disconnect-related failures.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void refetch()}
                    disabled={!tauriAvailable || isFetching}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isFetching ? <Spinner color="white" width="w-3.5" height="h-3.5" /> : <FaSyncAlt className="h-3.5 w-3.5" />}
                    {isFetching ? 'Refreshing...' : 'Refresh Logs'}
                </button>
            </div>

            {!tauriAvailable ? (
                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
                    Calibration logs are available inside the desktop or kiosk app.
                </div>
            ) : (
                <>
                    {errorMessage && (
                        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            Failed to load logs: {errorMessage}
                        </div>
                    )}

                    <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-950/70 p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-slate-400 uppercase">
                            <FaExclamationTriangle className="h-3.5 w-3.5 text-amber-300" />
                            High Signal
                        </div>
                        <div className="mt-3 space-y-2">
                            {isLoading ? (
                                <div className="flex items-center gap-2 text-sm text-slate-300">
                                    <Spinner color="yellow" width="w-4" height="h-4" />
                                    Loading calibration logs...
                                </div>
                            ) : highSignalLogs.length === 0 ? (
                                <div className="text-sm text-slate-400">
                                    No disconnects, missing motors, or calibration failures were detected in the latest logs yet.
                                </div>
                            ) : (
                                highSignalLogs.map((line, index) => (
                                    <div
                                        key={`${line}-${index}`}
                                        className={`rounded-lg border px-3 py-2 font-mono text-[11px] leading-5 break-words whitespace-pre-wrap ${getHighSignalTone(line)}`}
                                    >
                                        {line}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-950/70 p-4">
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-semibold tracking-[0.12em] text-slate-400 uppercase">Recent Calibration Logs</div>
                            <div className="text-[11px] text-slate-500">{recentRelevantLogs.length} lines</div>
                        </div>
                        <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-[11px] leading-5 text-slate-200">
                            {recentRelevantLogs.length === 0 ? (
                                <div className="text-slate-400">
                                    No recent calibration-specific lines matched this robot yet. Use Settings {'>'} Logs for the full log history.
                                </div>
                            ) : (
                                recentRelevantLogs.map((line, index) => (
                                    <div key={`${line}-${index}`} className="break-words whitespace-pre-wrap">
                                        {line}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
