'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { FaWifi, FaTimes, FaLock, FaLockOpen, FaSpinner, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import type { SystemInfo } from '@/hooks/System/system-info.hook';
import { addSavedWiFiSSID, removeSavedWiFiSSID } from '@/hooks/WIFI/wifi.hook';

interface WiFiNetwork {
    ssid: string;
    signal_strength: number;
    security: string;
}

interface WiFiModalProps {
    isOpen: boolean;
    onClose: () => void;
    systemInfo: SystemInfo;
}

const NETWORKS_PAGE_SIZE = 20;
const NETWORKS_SCROLL_THRESHOLD_PX = 120;

export const WiFiModal: React.FC<WiFiModalProps> = ({ isOpen, onClose, systemInfo }) => {
    const [mounted, setMounted] = useState(false);
    const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
    const [visibleCount, setVisibleCount] = useState(NETWORKS_PAGE_SIZE);
    const [selectedNetwork, setSelectedNetwork] = useState<WiFiNetwork | null>(null);
    const [currentConnection, setCurrentConnection] = useState<WiFiNetwork | null>(null);
    const [password, setPassword] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const scanNetworks = async () => {
        setIsScanning(true);
        setError(null);
        try {
            const [networksResult, currentResult] = await Promise.all([
                invoke<WiFiNetwork[]>('scan_wifi_networks'),
                invoke<WiFiNetwork | null>('get_current_wifi_connection'),
            ]);

            const uniqueNetworks = networksResult.reduce((acc, network) => {
                const existing = acc.find((n) => n.ssid === network.ssid);
                if (!existing) {
                    acc.push(network);
                } else if (network.signal_strength > existing.signal_strength) {
                    const index = acc.indexOf(existing);
                    acc[index] = network;
                }
                return acc;
            }, [] as WiFiNetwork[]);

            setNetworks(uniqueNetworks);
            setVisibleCount(NETWORKS_PAGE_SIZE);
            setCurrentConnection(currentResult);
        } catch (err) {
            const errorMsg = String(err);
            if (errorMsg.includes('Access is denied') || errorMsg.includes('os error 5')) {
                setError(
                    'Access denied. On Windows, this app needs to run as Administrator to scan WiFi networks. Please restart the app as Administrator.'
                );
            } else {
                setError(`Failed to scan networks: ${err}`);
            }
            console.error('WiFi scan error:', err);
        } finally {
            setIsScanning(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            scanNetworks();
        }
    }, [isOpen]);

    const handleConnect = async () => {
        if (!selectedNetwork) return;

        setIsConnecting(true);
        setError(null);
        setSuccess(null);

        try {
            const result = await invoke<string>('connect_to_wifi', {
                ssid: selectedNetwork.ssid,
                password,
                security: selectedNetwork.security,
            });
            setSuccess(result);
            addSavedWiFiSSID(selectedNetwork.ssid);

            setPassword('');
            setSelectedNetwork(null);
            setTimeout(() => {
                scanNetworks();
                setSuccess(null);
            }, 3000);
        } catch (err) {
            const errorMsg = String(err);
            if (errorMsg.includes('Access is denied') || errorMsg.includes('os error 5')) {
                setError(
                    'Access denied. On Windows, this app needs to run as Administrator to connect to WiFi. Please restart the app as Administrator.'
                );
            } else {
                setError(`Connection failed: ${err}`);
            }
            console.error('WiFi connection error:', err);
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        setIsDisconnecting(true);
        setError(null);
        setSuccess(null);

        try {
            const result = await invoke<string>('disconnect_from_wifi');
            setSuccess(result);
            removeSavedWiFiSSID(currentConnection?.ssid ?? '');

            setCurrentConnection(null);
            setTimeout(() => {
                scanNetworks();
                setSuccess(null);
            }, 3000);
        } catch (err) {
            const errorMsg = String(err);
            if (errorMsg.includes('Access is denied') || errorMsg.includes('os error 5')) {
                setError(
                    'Access denied. On Windows, this app needs to run as Administrator to disconnect from WiFi. Please restart the app as Administrator.'
                );
            } else {
                setError(`Disconnect failed: ${err}`);
            }
            console.error('WiFi disconnect error:', err);
        } finally {
            setIsDisconnecting(false);
        }
    };

    const handleNetworksScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (isScanning) return;
        const element = e.currentTarget;
        const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;

        if (distanceFromBottom <= NETWORKS_SCROLL_THRESHOLD_PX && visibleCount < networks.length) {
            setVisibleCount((prev) => Math.min(prev + NETWORKS_PAGE_SIZE, networks.length));
        }
    };

    const getSignalLevel = (strength: number) => {
        if (strength >= 75) return 4;
        if (strength >= 50) return 3;
        if (strength >= 25) return 2;
        return 1;
    };

    const getSignalColorClass = (strength: number) => {
        if (strength >= 75) return 'bg-emerald-400';
        if (strength >= 50) return 'bg-lime-400';
        if (strength >= 25) return 'bg-amber-400';
        return 'bg-rose-400';
    };

    const renderSignalBars = (strength: number) => {
        const level = getSignalLevel(strength);
        const activeColor = getSignalColorClass(strength);
        const heights = ['h-2', 'h-3', 'h-4', 'h-5'];

        return (
            <span className="inline-flex items-end gap-0.5" aria-label={`Signal ${strength}%`}>
                {heights.map((height, idx) => (
                    <span
                        key={`${height}-${idx}`}
                        className={`block w-1 rounded-sm ${height} ${idx + 1 <= level ? activeColor : 'bg-slate-600/70'}`}
                    />
                ))}
            </span>
        );
    };

    const isSecure = (security: string) => security !== 'Open' && security !== '';
    const sortedNetworks = [...networks].sort((a, b) => {
        if (a.signal_strength !== b.signal_strength) {
            return b.signal_strength - a.signal_strength;
        }
        return a.ssid.localeCompare(b.ssid);
    });
    const visibleNetworks = sortedNetworks.slice(0, visibleCount);
    const hasMoreNetworks = visibleCount < sortedNetworks.length;

    if (!isOpen) return null;
    if (!mounted || typeof window === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[2000] flex items-start justify-center bg-black/55 p-4 pt-8 backdrop-blur-sm" onClick={onClose}>
            <div
                className="mt-4 flex max-h-[82vh] w-full max-w-3xl cursor-default flex-col overflow-hidden rounded-2xl border border-slate-600/70 bg-slate-850 shadow-[0_20px_55px_rgba(2,6,23,0.65)]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-slate-700/80 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-blue-500/15 p-2 text-blue-300">
                            <FaWifi className="h-4 w-4" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-white">WiFi Networks</h2>
                            <span className="text-xs text-slate-400">{systemInfo.ipAddress ?? 'Disconnected'}</span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700/70 hover:text-white"
                    >
                        <FaTimes className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex flex-1 flex-col gap-4 p-5">
                    {error && (
                        <div className="mb-1 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                            <FaExclamationTriangle className="h-5 w-5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="mb-1 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-300">
                            <FaCheck className="h-5 w-5" />
                            <span>{success}</span>
                        </div>
                    )}

                    {currentConnection && (
                        <div className="rounded-lg border border-green-500/25 bg-green-500/10 p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-3 w-3 items-center justify-center">
                                        <div className="h-2 w-2 animate-pulse rounded-full bg-green-400"></div>
                                    </div>
                                    <div>
                                        <div className="font-semibold text-green-400">Connected to {currentConnection.ssid}</div>
                                        <div className="flex items-center gap-2 text-sm text-green-300">
                                            <span>Signal: {currentConnection.signal_strength}%</span>
                                            {currentConnection.signal_strength > 0 && renderSignalBars(currentConnection.signal_strength)}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleDisconnect}
                                    disabled={isDisconnecting}
                                    className="flex cursor-pointer items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isDisconnecting ? (
                                        <>
                                            <FaSpinner className="h-3 w-3 animate-spin" />
                                            Disconnecting...
                                        </>
                                    ) : (
                                        <>
                                            <FaTimes className="h-3 w-3" />
                                            Disconnect
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="text-sm text-slate-400">
                            {networks.length} network{networks.length !== 1 ? 's' : ''} found
                        </p>
                        <button
                            onClick={scanNetworks}
                            disabled={isScanning}
                            className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isScanning ? (
                                <>
                                    <FaSpinner className="h-4 w-4 animate-spin" />
                                    Scanning...
                                </>
                            ) : (
                                <>
                                    <FaWifi className="h-4 w-4" />
                                    Scan
                                </>
                            )}
                        </button>
                    </div>

                    {selectedNetwork && !currentConnection && (
                        <div className="rounded-lg border border-slate-700/80 bg-slate-900/70 p-4">
                            <h3 className="mb-3 text-sm font-semibold text-white">{`Connect to "${selectedNetwork.ssid}"`}</h3>

                            {isSecure(selectedNetwork.security) ? (
                                <div className="mb-3">
                                    <label htmlFor="wifi-password" className="mb-2 block text-sm font-medium text-slate-300">
                                        Password
                                    </label>
                                    <input
                                        id="wifi-password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && password) {
                                                handleConnect();
                                            }
                                        }}
                                        placeholder="Enter WiFi password"
                                        className="w-full rounded-lg border border-slate-600 bg-slate-800 p-3 text-white placeholder-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none"
                                        disabled={isConnecting}
                                    />
                                </div>
                            ) : (
                                <p className="mb-3 text-sm text-green-400">This is an open network (no password required)</p>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={handleConnect}
                                    disabled={isConnecting || (isSecure(selectedNetwork.security) && !password)}
                                    className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isConnecting ? (
                                        <>
                                            <FaSpinner className="h-4 w-4 animate-spin" />
                                            Connecting...
                                        </>
                                    ) : (
                                        <>
                                            <FaWifi className="h-4 w-4" />
                                            Connect
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedNetwork(null);
                                        setPassword('');
                                        setError(null);
                                    }}
                                    className="cursor-pointer rounded-lg bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    )}

                    <div onScroll={handleNetworksScroll} className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-700/90">
                        {sortedNetworks.length === 0 && !isScanning ? (
                            <div className="p-8 text-center text-slate-400">No networks found. Click "Scan" to search for WiFi networks.</div>
                        ) : (
                            visibleNetworks.map((network) => {
                                const isConnected = currentConnection?.ssid === network.ssid;
                                const isSelected = selectedNetwork?.ssid === network.ssid;

                                return (
                                    <button
                                        key={network.ssid}
                                        onClick={() => {
                                            setSelectedNetwork(network);
                                            setPassword('');
                                            setError(null);
                                            setSuccess(null);
                                        }}
                                        className={`flex w-full cursor-pointer items-center justify-between border-b border-slate-700/80 p-4 text-left transition-colors last:border-b-0 ${
                                            isConnected
                                                ? 'border-green-500/30 bg-green-500/20'
                                                : isSelected
                                                  ? 'bg-blue-500/20'
                                                  : 'hover:bg-slate-700/50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            {isConnected ? (
                                                <div className="flex h-4 w-4 items-center justify-center">
                                                    <div className="h-2 w-2 animate-pulse rounded-full bg-green-400"></div>
                                                </div>
                                            ) : isSecure(network.security) ? (
                                                <FaLock className="h-4 w-4 text-amber-400" />
                                            ) : (
                                                <FaLockOpen className="h-4 w-4 text-green-400" />
                                            )}
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-white">{network.ssid}</span>
                                                    {isConnected && (
                                                        <span className="rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                                                            Connected
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-slate-400">{network.security}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-slate-400">
                                            {renderSignalBars(network.signal_strength)}
                                            <span className="text-xs">{network.signal_strength}%</span>
                                        </div>
                                    </button>
                                );
                            })
                        )}

                        {hasMoreNetworks && !isScanning && (
                            <div className="flex items-center justify-center border-t border-slate-700/70 px-4 py-3 text-xs text-slate-400">
                                Showing {visibleNetworks.length} of {sortedNetworks.length}. Scroll to load more.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
