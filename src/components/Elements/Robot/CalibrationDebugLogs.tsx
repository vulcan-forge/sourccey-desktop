'use client';

import { useMemo, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { FaBug, FaTrash } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { Spinner } from '@/components/Elements/Spinner';
import { CALIBRATION_DEBUG_LOGS_KEY, useCalibrationDebugLogs } from '@/hooks/Control/calibration-debug-logs.hook';
import { queryClient } from '@/hooks/default';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';

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

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error ?? 'Unknown error');
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
    const [isClearingLogs, setIsClearingLogs] = useState(false);
    const [clearErrorMessage, setClearErrorMessage] = useState('');
    const {
        data: allLogs = [],
        isLoading,
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

    const queryErrorMessage = error instanceof Error ? error.message : error ? String(error) : '';

    const handleClearLogs = async () => {
        if (!tauriAvailable) {
            setClearErrorMessage('Calibration logs are only available inside the desktop or kiosk app.');
            return;
        }

        setIsClearingLogs(true);
        setClearErrorMessage('');

        try {
            await invoke('clear_log_dir');
            queryClient.setQueryData([CALIBRATION_DEBUG_LOGS_KEY, 400, 200], []);
            toast.success('Calibration logs cleared.', {
                ...toastSuccessDefaults,
            });
        } catch (clearError: unknown) {
            const message = `Failed to clear logs: ${getErrorMessage(clearError)}`;
            setClearErrorMessage(message);
            toast.error(message, {
                ...toastErrorDefaults,
            });
        } finally {
            setIsClearingLogs(false);
        }
    };

    return (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                        <FaBug className="h-4 w-4 text-cyan-300" />
                        Calibration Debug Logs
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Recent calibration-related logs for this robot.</p>
                </div>
                <button
                    type="button"
                    onClick={() => void handleClearLogs()}
                    disabled={!tauriAvailable || isClearingLogs}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/60 px-3 py-2 text-xs font-semibold text-red-200 transition hover:border-red-400/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isClearingLogs ? <Spinner color="white" width="w-3.5" height="h-3.5" /> : <FaTrash className="h-3.5 w-3.5" />}
                    {isClearingLogs ? 'Clearing...' : 'Clear Logs'}
                </button>
            </div>

            {!tauriAvailable ? (
                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
                    Calibration logs are available inside the desktop or kiosk app.
                </div>
            ) : (
                <>
                    {queryErrorMessage && (
                        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            Failed to load logs: {queryErrorMessage}
                        </div>
                    )}

                    {clearErrorMessage && (
                        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            {clearErrorMessage}
                        </div>
                    )}

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
