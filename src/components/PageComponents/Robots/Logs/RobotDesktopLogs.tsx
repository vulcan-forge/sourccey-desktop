'use client';

import { useDesktopEnvironmentSettings } from '@/hooks/System/desktop-environment.hook';
import type { DesktopEnvironmentSettings } from '@/types/desktop-environment';
import { appendCondensedLogs } from '@/utils/logs/control-logs/log-stream';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useState, useEffect, useRef, useCallback } from 'react';
import { FaTerminal, FaChevronDown, FaChevronUp } from 'react-icons/fa';

type RobotDesktopLogsProps = {
    isControlling: boolean;
    nickname?: string;
    embedded?: boolean;
};

type SshPayload = {
    nickname?: string;
    message?: string;
    error?: string;
    output?: string;
};

const formatMessage = (label: string, message: string) => {
    const trimmed = message.trim();
    return trimmed ? `[${label}] ${trimmed}` : `[${label}]`;
};

const LOG_LEVEL_PRIORITY: Record<DesktopEnvironmentSettings['teleopLogLevel'], number> = {
    debug: 10,
    info: 20,
    warning: 30,
    error: 40,
};

const getLogLevelForLine = (log: string): DesktopEnvironmentSettings['teleopLogLevel'] | null => {
    const match = log.match(/(?:^\[[^\]]+\]\s*)?(DEBUG|INFO|WARNING|ERROR)\b/i);
    if (!match) {
        return null;
    }

    const matchedLevel = match[1];
    if (!matchedLevel) {
        return null;
    }

    const normalized = matchedLevel.toLowerCase();
    if (normalized === 'warn' || normalized === 'warning') {
        return 'warning';
    }

    if (normalized === 'debug' || normalized === 'info' || normalized === 'error') {
        return normalized;
    }

    return null;
};

const MAX_STORED_LOGS = 60;
const MAX_RENDERED_LOGS = 40;
const LOG_FLUSH_INTERVAL_MS = 200;

export const RobotDesktopLogs = ({ isControlling, nickname, embedded = false }: RobotDesktopLogsProps) => {
    const { data: desktopEnvironmentSettings } = useDesktopEnvironmentSettings();
    const [controlLogs, setControlLogs] = useState<string[]>([]);
    const [isExpanded, setIsExpanded] = useState(isControlling);
    const logsRef = useRef<string[]>([]);
    const pendingLogsRef = useRef<string[]>([]);
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const teleopLogLevel = desktopEnvironmentSettings?.teleopLogLevel ?? 'warning';

    const flushPendingLogs = useCallback(() => {
        flushTimerRef.current = null;

        if (pendingLogsRef.current.length === 0) {
            return;
        }

        const nextLogs = appendCondensedLogs(logsRef.current, pendingLogsRef.current, MAX_STORED_LOGS);
        pendingLogsRef.current = [];
        logsRef.current = nextLogs;
        setControlLogs(nextLogs);
    }, []);

    const appendLog = useCallback(
        (log: string) => {
            if (nickname && !log.includes(`[${nickname}]`)) {
                return;
            }

            const lineLevel = getLogLevelForLine(log);
            if (lineLevel && LOG_LEVEL_PRIORITY[lineLevel] < LOG_LEVEL_PRIORITY[teleopLogLevel]) {
                return;
            }

            pendingLogsRef.current.push(log);
            if (flushTimerRef.current === null) {
                flushTimerRef.current = setTimeout(flushPendingLogs, LOG_FLUSH_INTERVAL_MS);
            }
        },
        [flushPendingLogs, nickname, teleopLogLevel]
    );

    // Update internal state when external prop changes
    useEffect(() => {
        setIsExpanded(isControlling);
        if (!isControlling) {
            if (flushTimerRef.current !== null) {
                clearTimeout(flushTimerRef.current);
                flushTimerRef.current = null;
            }
            pendingLogsRef.current = [];
            logsRef.current = [];
            setControlLogs([]);
        }
    }, [isControlling]);

    useEffect(
        () => () => {
            if (flushTimerRef.current !== null) {
                clearTimeout(flushTimerRef.current);
                flushTimerRef.current = null;
            }
        },
        []
    );

    useEffect(() => {
        if (!isControlling) {
            return;
        }

        let isActive = true;
        const unlistenFns: UnlistenFn[] = [];

        const matchesNickname = (payload?: SshPayload) => {
            if (!nickname) return true;
            return payload?.nickname === nickname;
        };

        const register = async (eventName: string, label: string, getMessage: (payload: SshPayload) => string) => {
            const unlisten = await listen<SshPayload>(eventName, (event) => {
                if (!isActive) return;
                if (!matchesNickname(event.payload)) return;
                appendLog(formatMessage(label, getMessage(event.payload)));
            });

            if (!isActive) {
                unlisten();
                return;
            }

            unlistenFns.push(unlisten);
        };

        const setupListeners = async () => {
            const unlistenTeleop = await listen<string>('teleop-log', (event) => {
                if (!isActive) return;
                appendLog(event.payload);
            });
            if (!isActive) {
                unlistenTeleop();
                return;
            }
            unlistenFns.push(unlistenTeleop);

            const unlistenRecord = await listen<string>('record-log', (event) => {
                if (!isActive) return;
                appendLog(event.payload);
            });
            if (!isActive) {
                unlistenRecord();
                return;
            }
            unlistenFns.push(unlistenRecord);

            const unlistenRollout = await listen<string>('rollout-log', (event) => {
                if (!isActive) return;
                appendLog(event.payload);
            });
            if (!isActive) {
                unlistenRollout();
                return;
            }
            unlistenFns.push(unlistenRollout);

            const unlistenInference = await listen<string>('inference-log', (event) => {
                if (!isActive) return;
                appendLog(event.payload);
            });
            if (!isActive) {
                unlistenInference();
                return;
            }
            unlistenFns.push(unlistenInference);
        };

        setupListeners();

        return () => {
            isActive = false;
            unlistenFns.forEach((fn) => fn());
        };
    }, [appendLog, isControlling, nickname]);

    const containerClassName = embedded
        ? 'overflow-hidden rounded-2xl border-2 border-slate-700/70 bg-slate-900/60 shadow-[0_18px_40px_rgba(15,23,42,0.22)]'
        : 'overflow-hidden rounded-2xl border-2 border-slate-700/70 bg-slate-900/60 shadow-[0_18px_40px_rgba(15,23,42,0.22)]';
    const headerClassName = embedded
        ? 'flex items-center justify-between border-b border-slate-700/70 px-5 py-4'
        : 'flex items-center justify-between border-b border-slate-700/70 px-5 py-4';

    return (
        <div className={containerClassName}>
            <div className={headerClassName}>
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950/45 text-slate-400">
                        <FaTerminal className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-base font-semibold text-white">Session Logs</h3>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                            <div className={`h-2 w-2 rounded-full ${isControlling ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`} />
                            <span>{isControlling ? 'Live output' : 'Idle'}</span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/45 px-3 py-2 text-sm font-medium text-slate-100 transition-all hover:border-slate-600 hover:bg-slate-900"
                >
                    {isExpanded ? (
                        <>
                            <FaChevronUp className="h-4 w-4" />
                            Hide
                        </>
                    ) : (
                        <>
                            <FaChevronDown className="h-4 w-4" />
                            Show
                        </>
                    )}
                </button>
            </div>

            {isExpanded && (
                <>
                    <div className="scrollbar scrollbar-thumb-slate-600 scrollbar-track-slate-800 h-[320px] overflow-y-auto bg-slate-950/45 font-mono">
                        <div className="space-y-1 p-5">
                            {controlLogs.length > 0 ? (
                                controlLogs.slice(-MAX_RENDERED_LOGS).map((log, index) => (
                                    <div key={index} className="rounded-lg bg-slate-900/55 px-3 py-2 text-xs leading-relaxed text-slate-300">
                                        {log}
                                    </div>
                                ))
                            ) : (
                                <div className="text-sm text-slate-400">
                                    {isControlling ? 'Waiting for robot output...' : 'Log stream is inactive'}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-slate-700/70 px-5 py-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>{controlLogs.length} recent entries shown</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export const RobotLogs = RobotDesktopLogs;
