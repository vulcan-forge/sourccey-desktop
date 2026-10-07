'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FaChevronDown, FaMicrochip, FaRedoAlt, FaRobot, FaVideo } from 'react-icons/fa';
import type { KioskHardwareConnection } from './welcome.types';

export const WelcomeHardwareStatus = () => {
    const [connections, setConnections] = useState<KioskHardwareConnection[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const nextConnections = await invoke<KioskHardwareConnection[]>('get_kiosk_hardware_connections');
            setConnections(nextConnections);
            setError(null);
        } catch (refreshError) {
            console.error('Failed to read kiosk hardware connections:', refreshError);
            setError('Hardware status unavailable');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
        const interval = window.setInterval(() => void refresh(), 15_000);
        return () => window.clearInterval(interval);
    }, [refresh]);

    const connectedCount = useMemo(() => connections.filter((connection) => connection.connected).length, [connections]);
    const allConnected = connections.length > 0 && connectedCount === connections.length;
    const summary = loading && connections.length === 0
        ? 'Checking hardware…'
        : error ?? `${connectedCount}/${connections.length} connected`;

    return (
        <div className="overflow-hidden rounded-lg border border-slate-600/80 bg-slate-900/35">
            <div className="flex items-center gap-3 px-4 py-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${allConnected ? 'bg-emerald-400' : error ? 'bg-slate-500' : 'bg-amber-400'}`} />
                <FaMicrochip className="h-4 w-4 shrink-0 text-slate-300" />
                <button
                    type="button"
                    onClick={() => setExpanded((current) => !current)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left focus:outline-none"
                    aria-expanded={expanded}
                >
                    <span>
                        <span className="text-sm font-semibold text-white">Hardware connections</span>
                        <span className="ml-2 text-xs text-slate-400">{summary}</span>
                    </span>
                    <FaChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
                <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={loading}
                    className="rounded-md p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white disabled:opacity-50"
                    aria-label="Refresh hardware connections"
                    title="Refresh hardware connections"
                >
                    <FaRedoAlt className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {expanded ? (
                <div className="grid grid-cols-1 gap-2 border-t border-slate-700 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
                    {connections.map((connection) => {
                        const DeviceIcon = connection.category === 'camera' ? FaVideo : FaRobot;
                        return (
                            <div key={connection.expectedPath} className="flex min-w-0 items-start gap-2 rounded-md bg-slate-800/70 px-3 py-2">
                                <DeviceIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${connection.connected ? 'text-emerald-300' : 'text-amber-300'}`} />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-xs font-medium text-white">
                                        <span className="truncate">{connection.name}</span>
                                        <span className={connection.connected ? 'text-emerald-300' : 'text-amber-300'}>
                                            {connection.connected ? 'Connected' : 'Missing'}
                                        </span>
                                    </div>
                                    <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400" title={connection.expectedPath}>
                                        {connection.expectedPath}
                                        {connection.resolvedPath ? ` → ${connection.resolvedPath}` : ''}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {error ? <p className="text-xs text-amber-300">{error}. Use Refresh to try again.</p> : null}
                </div>
            ) : null}
        </div>
    );
};
