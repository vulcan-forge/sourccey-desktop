'use client';

import { filterLogs } from '@/utils/logs/control-logs/control-logs';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useState, useEffect, useRef, useCallback } from 'react';
import { FaTerminal, FaChevronDown, FaChevronUp } from 'react-icons/fa';

type RobotDesktopLogsProps = {
    isControlling: boolean;
    nickname?: string;
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

export const RobotDesktopLogs = ({ isControlling, nickname }: RobotDesktopLogsProps) => {
    const [controlLogs, setControlLogs] = useState<string[]>([]);
    const [isExpanded, setIsExpanded] = useState(isControlling);
    const logsRef = useRef<string[]>([]);

    const appendLog = useCallback((log: string) => {
        const filteredLogs = filterLogs([...logsRef.current, log]);
        const newLogs = filteredLogs.slice(-100);
        logsRef.current = newLogs;
        setControlLogs(newLogs);
    }, []);

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
            await register('ssh-connection-success', 'SSH', (p) => `Connected: ${p.message ?? ''}`);
            await register('ssh-connection-error', 'SSH', (p) => `Connection error: ${p.error ?? ''}`);
            await register('ssh-is-connected', 'SSH', (p) => `Status: ${p.message ?? ''}`);
            await register('ssh-is-connected-error', 'SSH', (p) => `Status error: ${p.error ?? ''}`);
            await register('robot-start-success', 'SSH', (p) => `Start: ${p.message ?? ''}`);
            await register('robot-start-error', 'SSH', (p) => `Start error: ${p.error ?? ''}`);
            await register('robot-stop-success', 'SSH', (p) => `Stop: ${p.message ?? ''}`);
            await register('robot-stop-error', 'SSH', (p) => `Stop error: ${p.error ?? ''}`);
            await register('robot-is-started-success', 'SSH', (p) => {
                const output = p.output ? ` (${p.output})` : '';
                return `Running: ${p.message ?? ''}${output}`;
            });
            await register('robot-is-started-error', 'SSH', (p) => `Running error: ${p.error ?? ''}`);
        };

        setupListeners();

        return () => {
            isActive = false;
            unlistenFns.forEach((fn) => fn());
        };
    }, [appendLog, isControlling, nickname]);

    return (
        <div className="bg-slate-825 overflow-hidden rounded-xl border-2 border-slate-700 backdrop-blur-sm">
            <div className="bg-slate-825 flex items-center justify-between border-b border-slate-700 p-4">
                <div className="flex items-center gap-3">
                    <FaTerminal className="h-5 w-5 text-slate-400" />
                    <h3 className="text-lg font-semibold text-white">SSH Logs</h3>
                    {isControlling && (
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                            <span className="text-sm text-slate-400">Live</span>
                        </div>
                    )}
                    {!isControlling && (
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-red-400" />
                            <span className="text-sm text-slate-400">Inactive</span>
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-slate-700/60"
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
                    <div className="scrollbar scrollbar-thumb-slate-600 scrollbar-track-slate-800 h-[500px] overflow-y-auto bg-slate-900/50 font-mono">
                        <div className="space-y-0.5 p-4">
                            {controlLogs.length > 0 ? (
                                controlLogs.slice(-50).map((log, index) => (
                                    <div key={index} className="text-xs leading-relaxed text-slate-400">
                                        {log}
                                    </div>
                                ))
                            ) : (
                                <div className="text-sm text-slate-400">
                                    {isControlling ? 'Waiting for SSH events...' : 'SSH log stream is inactive'}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-slate-825 border-t border-slate-700 p-3">
                        <div className="flex items-center justify-between font-mono text-xs text-slate-400">
                            <span>ENTRIES: {controlLogs.length}</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export const RobotLogs = RobotDesktopLogs;
