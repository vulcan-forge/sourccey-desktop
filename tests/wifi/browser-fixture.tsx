// @ts-nocheck
// Mount the production components. Only native IPC and Next's router are mocked.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import { queryClient } from '../../src/hooks/default';
import KioskSettingsPage from '../../src/app/kiosk/settings/page';
import { WiFiModal } from '../../src/components/Elements/Modals/KioskRobotModals/WiFiModal';

const scenario = new URLSearchParams(window.location.search).get('scenario') ?? '';
const security = { open: 'Open', wpa: 'WPA', wpa2: 'WPA2', mixed: 'WPA2 WPA3' }[scenario] ?? 'WPA3';
const network = { ssid: 'Customer Wi-Fi', signal_strength: 80, security };
const inactive = { active: false, ssid: null, ip_address: null, interface: null };
const state = (window.__networkTest = {
    calls: [],
    credentials: { ssid: 'Saved Robot', password: 'saved-password' },
    status: ['hotspot', 'disable-error', 'stalled-refresh'].includes(scenario)
        ? { active: true, ssid: 'Saved Robot', ip_address: '192.168.4.1', interface: 'wlan0' }
        : inactive,
    current: ['connected', 'disconnect-error', 'scan-error'].includes(scenario) ? network : null,
    pending: null,
    stallStatus: false,
    refreshStatus: () => queryClient.invalidateQueries({ queryKey: ['access-point', 'status'] }),
});
window.isTauri = true;
window.__TAURI_INTERNALS__ = {
    invoke: async (command, args) => {
        state.calls.push({ command, args });
        if (command === 'get_app_mode') return true;
        if (command === 'get_system_info') return { ip_address: '192.168.1.2', temperature: '40 C', thermal_data: {}, battery_data: {} };
        if (command === 'get_access_point_status') {
            if (scenario === 'status-error') throw 'NetworkManager unavailable';
            if (state.stallStatus) await new Promise(() => {});
            return state.status;
        }
        if (command === 'get_access_point_credentials') {
            if (scenario === 'credentials-error') throw 'Cannot read credentials file';
            if (['slow-credentials', 'stale-credentials'].includes(scenario)) await new Promise((resolve) => setTimeout(resolve, 500));
            return state.credentials;
        }
        if (command === 'save_access_point_credentials') {
            if (scenario === 'save-error') throw 'Cannot write credentials file';
            state.credentials = args;
            return;
        }
        if (command === 'set_access_point') {
            if (scenario === 'enable-error') throw 'Adapter does not support hotspot mode';
            if (scenario === 'pending-enable')
                await new Promise((resolve) => {
                    state.pending = resolve;
                });
            state.credentials = args;
            state.status = { active: true, ssid: args.ssid, ip_address: '192.168.4.1', interface: 'wlan0' };
            state.current = null;
            return state.status;
        }
        if (command === 'set_wifi') {
            if (scenario === 'disable-error') throw 'Could not disable hotspot';
            state.status = inactive;
            if (scenario === 'stalled-refresh') state.stallStatus = true;
            return { reconnected: false, message: 'Robot Wi-Fi is off. Select a network from the Wi-Fi menu.' };
        }
        if (command === 'scan_wifi_networks') {
            if (scenario === 'scan-error') throw 'Wi-Fi scan unavailable';
            return [network];
        }
        if (command === 'get_current_wifi_connection') return state.current;
        if (command === 'connect_to_wifi') {
            if (scenario === 'connect-error') throw 'Connection failed: authentication failed';
            if (scenario === 'pending-connect')
                await new Promise((resolve) => {
                    state.pending = resolve;
                });
            state.current = network;
            return 'Successfully connected to Customer Wi-Fi';
        }
        if (command === 'disconnect_from_wifi') {
            if (scenario === 'disconnect-error') throw 'Disconnect not authorized';
            state.current = null;
            return 'Successfully disconnected from WiFi';
        }
        throw `Unexpected IPC command: ${command}`;
    },
};
if (scenario === 'stale-credentials')
    queryClient.setQueryData(['access-point', 'credentials'], { ssid: 'Old Cache', password: 'old-cache-password' });

function Fixture() {
    const [open, setOpen] = useState(true);
    const modal = window.location.pathname.includes('/modal');
    return (
        <QueryClientProvider client={queryClient}>
            {modal ? (
                <>
                    <button onClick={() => setOpen(true)}>Open Wi-Fi</button>
                    <WiFiModal isOpen={open} onClose={() => setOpen(false)} systemInfo={{ ipAddress: '192.168.1.2' }} />
                </>
            ) : (
                <KioskSettingsPage />
            )}
            <ToastContainer />
        </QueryClientProvider>
    );
}
createRoot(document.getElementById('root')).render(<Fixture />);
