'use client';

import { filterLogs } from '@/utils/logs/control-logs/control-logs';
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

export const RobotDesktopLogs = ({ isControlling, nickname, embedded = false }: RobotDesktopLogsProps) => {
    const [controlLogs, setControlLogs] = useState<string[]>([]);
    const [isExpanded, setIsExpanded] = useState(isControlling);
    const logsRef = useRef<string[]>([]);

    const appendLog = useCallback(
        (log: string) => {
            if (nickname && !log.includes(`[${nickname}]`)) {
                return;
            }
            const filteredLogs = filterLogs([...logsRef.current, log]);
            const newLogs = filteredLogs.slice(-100);
            logsRef.current = newLogs;
            setControlLogs(newLogs);
        },
        [nickname]
    );

    // Update internal state when external prop changes
    useEffect(() => {
        setIsExpanded(isControlling);
        if (!isControlling) {
            logsRef.current = [];
            setControlLogs([]);
        }
    }, [isControlling]);

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
                                controlLogs.slice(-50).map((log, index) => (
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
                            <span>{controlLogs.length} entries</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export const RobotLogs = RobotDesktopLogs;
