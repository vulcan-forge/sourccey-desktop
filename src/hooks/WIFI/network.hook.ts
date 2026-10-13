import { invoke } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/hooks/default';
import { networkErrorMessage } from '@/utils/network-error';

export interface EthernetDevice {
    interface: string;
    state: 'connected' | 'connecting' | 'disconnected' | 'disconnecting' | 'unavailable' | 'unmanaged' | 'failed' | 'unknown';
    cable_connected: boolean;
    connection: string | null;
    addresses: string[];
    gateway: string | null;
}

export interface NetworkStatus {
    ethernet: EthernetDevice[];
    primary_interface: string | null;
    connectivity: 'full' | 'limited' | 'portal' | 'none' | 'unknown';
}

export const NETWORK_STATUS_KEY = ['network', 'status'];
// Shared across the navbar, welcome card and modal. Try once per cable insertion
// so DHCP/auth failures do not cause an endless reconnect loop.
const attempted = new Set<string>();
const pending = new Map<string, Promise<string>>();
const failures = new Map<string, string>();
const OPERATIONS_KEY = ['network', 'ethernet-operations'];
const operationSnapshot = () => ({ pending: [...pending.keys()], errors: Object.fromEntries(failures) });
const publishOperations = () => queryClient.setQueryData(OPERATIONS_KEY, operationSnapshot());

export const useEthernetOperations = () =>
    useQuery({
        queryKey: OPERATIONS_KEY,
        queryFn: operationSnapshot,
        initialData: operationSnapshot,
        staleTime: Infinity,
        gcTime: 0,
    });

export const connectEthernet = (device: string): Promise<string> => {
    const existing = pending.get(device);
    if (existing) return existing;
    attempted.add(device);
    failures.delete(device);
    const operation = invoke<string>('connect_ethernet', { interface: device })
        .catch((error: unknown) => {
            failures.set(device, networkErrorMessage(error, 'Could not connect Ethernet'));
            throw error;
        })
        .finally(() => {
            pending.delete(device);
            publishOperations();
            void queryClient.invalidateQueries({ queryKey: NETWORK_STATUS_KEY });
        });
    pending.set(device, operation);
    publishOperations();
    return operation;
};

export const getNetworkStatus = async (): Promise<NetworkStatus> => {
    const status = await invoke<NetworkStatus>('get_network_status');
    const present = new Set(status.ethernet.map((device) => device.interface));
    for (const device of attempted) if (!present.has(device)) attempted.delete(device);
    let failuresChanged = false;
    for (const device of failures.keys()) if (!present.has(device)) failuresChanged = failures.delete(device) || failuresChanged;
    for (const device of status.ethernet) {
        if (!device.cable_connected) attempted.delete(device.interface);
        if (!device.cable_connected || device.state === 'connected') {
            failuresChanged = failures.delete(device.interface) || failuresChanged;
        }
        if (device.cable_connected && device.state === 'disconnected' && !attempted.has(device.interface)) {
            attempted.add(device.interface);
            // Status remains available while NetworkManager negotiates DHCP.
            void connectEthernet(device.interface).catch(() => {});
        }
    }
    if (failuresChanged) publishOperations();
    return status;
};

export const useNetworkStatus = (enabled = true) =>
    useQuery({
        queryKey: NETWORK_STATUS_KEY,
        queryFn: getNetworkStatus,
        enabled,
        staleTime: 1000,
        gcTime: 0,
        retry: false,
        refetchInterval: 3000,
        refetchIntervalInBackground: true,
    });

export function networkSummary(status?: NetworkStatus) {
    if (!status) return { label: 'Network', detail: 'Checking connection', wired: false };
    const wired =
        status.ethernet.find((device) => device.state === 'connected' && device.interface === status.primary_interface) ??
        (!status.primary_interface ? status.ethernet.find((device) => device.state === 'connected') : undefined);
    if (wired) return { label: 'Ethernet', detail: wired.addresses[0]?.split('/')[0] ?? 'Connected', wired: true };
    if (status.primary_interface) return { label: 'Network', detail: `Connected · ${status.primary_interface}`, wired: false };
    if (status.ethernet.some((device) => device.cable_connected && device.state === 'connecting')) {
        return { label: 'Ethernet', detail: 'Connecting', wired: true };
    }
    return { label: 'Network', detail: 'No default connection', wired: false };
}
