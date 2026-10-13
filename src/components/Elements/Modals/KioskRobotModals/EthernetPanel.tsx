'use client';

import { FaNetworkWired, FaSpinner } from 'react-icons/fa';
import { connectEthernet, useNetworkStatus, useEthernetOperations } from '@/hooks/WIFI/network.hook';
import type { EthernetDevice } from '@/hooks/WIFI/network.hook';

function deviceLabel(device: EthernetDevice) {
    if (device.state === 'unmanaged') return 'Adapter needs network setup';
    if (!device.cable_connected) return 'Cable unplugged';
    if (device.state === 'connected') return device.addresses.length ? 'Connected' : 'Connected · waiting for an IP address';
    if (device.state === 'connecting') return 'Connecting · requesting an IP address';
    if (device.state === 'disconnecting') return 'Disconnecting';
    if (device.state === 'unavailable') return 'Adapter unavailable · check the port or restart the kiosk';
    if (device.state === 'failed') return 'Connection failed';
    return 'Cable detected · ready to connect';
}

export function EthernetPanel({ enabled }: { enabled: boolean }) {
    const { data: status, error: statusError, isPending, refetch } = useNetworkStatus(enabled);
    const { data: operations } = useEthernetOperations();

    return (
        <section aria-label="Ethernet" className="shrink-0 rounded-xl border border-slate-600/70 bg-slate-900/40 p-4">
            <div className="mb-2 flex items-center gap-2 font-semibold text-white">
                <FaNetworkWired className="text-blue-300" />
                Ethernet
            </div>
            {statusError ? (
                <div className="flex items-center justify-between gap-3 text-sm text-amber-200">
                    <span>Could not read wired network status.</span>
                    <button onClick={() => void refetch()} className="rounded-lg bg-slate-700 px-3 py-2 text-white">
                        Retry
                    </button>
                </div>
            ) : isPending ? (
                <p className="text-sm text-slate-400">Checking cable connection…</p>
            ) : status?.ethernet.length === 0 ? (
                <p className="text-sm text-slate-400">
                    No Ethernet adapter detected. Connect the kiosk&apos;s Ethernet port to your router for automatic setup.
                </p>
            ) : (
                status?.ethernet.map((device) => (
                    <div key={device.interface} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                            <div className={`text-sm font-medium ${device.state === 'connected' ? 'text-emerald-300' : 'text-slate-200'}`}>
                                {deviceLabel(device)}
                                {device.state === 'connected' && status.primary_interface === device.interface && (
                                    <span className="ml-2 rounded bg-emerald-500/15 px-2 py-1 text-xs">Primary connection</span>
                                )}
                            </div>
                            <p className="text-xs break-all text-slate-400">
                                {device.interface}
                                {device.connection ? ` · ${device.connection}` : ''}
                            </p>
                            {device.state === 'connected' &&
                                device.addresses.map((address) => (
                                    <p key={address} className="font-mono text-sm break-all text-slate-300">
                                        {address}
                                    </p>
                                ))}
                            {device.gateway && device.state === 'connected' && (
                                <p className="text-xs text-slate-400">Gateway: {device.gateway}</p>
                            )}
                            {device.state === 'unmanaged' && (
                                <p className="text-xs text-amber-200">Ask your IT team to enable NetworkManager for this adapter.</p>
                            )}
                            {operations.errors[device.interface] && (
                                <p role="alert" className="mt-2 text-sm text-red-300">
                                    {operations.errors[device.interface]}
                                </p>
                            )}
                        </div>
                        {device.cable_connected && ['disconnected', 'failed'].includes(device.state) && (
                            <button
                                onClick={() => void connectEthernet(device.interface).catch(() => {})}
                                disabled={operations.pending.length > 0}
                                className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                aria-label={`Connect Ethernet ${device.interface}`}
                            >
                                {operations.pending.includes(device.interface) && <FaSpinner className="animate-spin" />}
                                {operations.pending.includes(device.interface) ? 'Connecting…' : 'Connect'}
                            </button>
                        )}
                    </div>
                ))
            )}
            {status && !statusError && status.primary_interface && (
                <p className="mt-2 text-xs text-slate-400">
                    {status.connectivity === 'full'
                        ? 'Internet access available.'
                        : status.connectivity === 'portal'
                          ? 'This network requires a sign-in. Ask your IT team to authorize the kiosk.'
                          : status.connectivity === 'limited' || status.connectivity === 'none'
                            ? 'Local network connected. Internet access is unavailable.'
                            : 'Internet access has not been verified.'}
                </p>
            )}
        </section>
    );
}
