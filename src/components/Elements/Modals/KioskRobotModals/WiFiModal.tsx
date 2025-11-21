'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { FaWifi, FaTimes, FaLock, FaLockOpen, FaSpinner, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import type { BatteryData } from '@/app/app/settings/page';
import { addSavedWiFiSSID, removeSavedWiFiSSID } from '@/hooks/WIFI/wifi.hook';

interface WiFiNetwork {
    ssid: string;
    signal_strength: number;
    security: string;
}

interface WiFiModalProps {
    isOpen: boolean;
    onClose: () => void;
    systemInfo: {
        ipAddress: string;
        temperature: string;
        batteryData: BatteryData;
    };
}

export const WiFiModal: React.FC<WiFiModalProps> = ({ isOpen, onClose, systemInfo }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);
    const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
    const [selectedNetwork, setSelectedNetwork] = useState<WiFiNetwork | null>(null);
    const [currentConnection, setCurrentConnection] = useState<WiFiNetwork | null>(null);
    const [password, setPassword] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const getCurrentConnection = async () => {
        try {
            const result = await invoke<WiFiNetwork | null>('get_current_wifi_connection');
            setCurrentConnection(result);
        } catch (err) {
            console.error('Failed to get current connection:', err);
            setCurrentConnection(null);
        }
    };

    const scanNetworks = async () => {
        setIsScanning(true);
        setError(null);
        try {
            const [networksResult, currentResult] = await Promise.all([
                invoke<WiFiNetwork[]>('scan_wifi_networks'),
                invoke<WiFiNetwork | null>('get_current_wifi_connection'),
            ]);

            // Deduplicate networks by SSID, keeping the one with strongest signal
            const uniqueNetworks = networksResult.reduce((acc, network) => {
                const existing = acc.find((n) => n.ssid === network.ssid);
                if (!existing) {
                    acc.push(network);
                } else if (network.signal_strength > existing.signal_strength) {
                    // Replace with stronger signal
                    const index = acc.indexOf(existing);
                    acc[index] = network;
                }
                return acc;
            }, [] as WiFiNetwork[]);

            setNetworks(uniqueNetworks);
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
                password: password,
                security: selectedNetwork.security,
            });
            setSuccess(result);
            addSavedWiFiSSID(selectedNetwork.ssid);

            setPassword('');
            setSelectedNetwork(null);
            // Refresh network list and current connection after connection
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
            // Refresh network list after disconnection
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

    const getSignalIcon = (strength: number) => {
        if (strength >= 75) return '▂▄▆█';
        if (strength >= 50) return '▂▄▆';
        if (strength >= 25) return '▂▄';
        return '▂';
    };

    const isSecure = (security: string) => {
        return security !== 'Open' && security !== '';
    };

    if (!isOpen) return null;

    // Ensure this only runs on the client
    if (!mounted || typeof window === 'undefined') {
        return null;
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[2000] flex cursor-pointer items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="flex max-h-[85vh] w-full max-w-2xl cursor-default flex-col overflow-hidden rounded-xl border border-slate-600 bg-slate-800 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-700 p-4">
                    <div className="flex items-center gap-3">
                        <FaWifi className="h-5 w-5 text-blue-400" />
                        <h2 className="text-xl font-bold text-white">WiFi Networks </h2>
                        <span className="text-sm text-slate-400">{systemInfo.ipAddress}</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="mt-1 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                    >
                        <FaTimes className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {/* Current Connection Status */}
                    {currentConnection && (
                        <div className="mb-6 rounded-lg border border-green-500/20 bg-green-500/10 p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-3 w-3 items-center justify-center">
                                        <div className="h-2 w-2 animate-pulse rounded-full bg-green-400"></div>
                                    </div>
                                    <div>
                                        <div className="font-semibold text-green-400">Connected to {currentConnection.ssid}</div>
                                        <div className="text-sm text-green-300">
                                            Signal: {currentConnection.signal_strength}%
                                            {currentConnection.signal_strength > 0 && (
                                                <span className="ml-2 font-mono">{getSignalIcon(currentConnection.signal_strength)}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleDisconnect}
                                    disabled={isDisconnecting}
                                    className="flex items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
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

                    {/* Status Messages */}
                    {error && (
                        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-400">
                            <FaExclamationTriangle className="h-5 w-5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-green-400">
                            <FaCheck className="h-5 w-5" />
                            <span>{success}</span>
                        </div>
                    )}

                    {/* Scan Button */}
                    <div className="mb-4 flex items-center justify-between">
                        <p className="text-sm text-slate-400">
                            {networks.length} network{networks.length !== 1 ? 's' : ''} found
                        </p>
                        <button
                            onClick={scanNetworks}
                            disabled={isScanning}
                            className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
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

                    {/* Network List */}
                    <div className="mb-6 max-h-64 overflow-y-auto rounded-lg border border-slate-700">
                        {networks.length === 0 && !isScanning ? (
                            <div className="p-8 text-center text-slate-400">
                                No networks found. Click &ldquo;Scan&rdquo; to search for WiFi networks.
                            </div>
                        ) : (
                            networks.map((network) => {
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
                                        className={`flex w-full items-center justify-between border-b border-slate-700 p-4 text-left transition-colors last:border-b-0 ${
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
                                            <span className="font-mono text-sm">{getSignalIcon(network.signal_strength)}</span>
                                            <span className="text-xs">{network.signal_strength}%</span>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Connection Form */}
                    {selectedNetwork && (
                        <div className="rounded-lg border border-slate-700 bg-slate-900 p-6">
                            <h3 className="mb-4 text-lg font-semibold text-white">
                                {currentConnection?.ssid === selectedNetwork.ssid
                                    ? `Already connected to "${selectedNetwork.ssid}"`
                                    : `Connect to "${selectedNetwork.ssid}"`}
                            </h3>

                            {isSecure(selectedNetwork.security) ? (
                                <div className="mb-4">
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
                                    />
                                </div>
                            ) : (
                                <p className="mb-4 text-sm text-green-400">This is an open network (no password required)</p>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={handleConnect}
                                    disabled={
                                        isConnecting ||
                                        (isSecure(selectedNetwork.security) && !password) ||
                                        currentConnection?.ssid === selectedNetwork.ssid
                                    }
                                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isConnecting ? (
                                        <>
                                            <FaSpinner className="h-4 w-4 animate-spin" />
                                            Connecting...
                                        </>
                                    ) : currentConnection?.ssid === selectedNetwork.ssid ? (
                                        <>
                                            <FaCheck className="h-4 w-4" />
                                            Already Connected
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
                                    className="rounded-lg bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
