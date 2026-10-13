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
    status: ['hotspot', 'disable-error', 'stalled-refresh', 'ethernet-hotspot'].includes(scenario)
        ? { active: true, ssid: 'Saved Robot', ip_address: '192.168.4.1', interface: 'wlan0' }
        : inactive,
    current: ['connected', 'disconnect-error', 'scan-error'].includes(scenario) ? network : null,
    pending: null,
    stallStatus: false,
    refreshStatus: () => queryClient.invalidateQueries({ queryKey: ['access-point', 'status'] }),
    refreshNetwork: () => queryClient.invalidateQueries({ queryKey: ['network', 'status'] }),
    network: {
        ethernet: scenario.startsWith('ethernet')
            ? [
                  {
                      interface: 'enx123',
                      state:
                          scenario === 'ethernet-unplugged'
                              ? 'unavailable'
                              : ['ethernet-auto', 'ethernet-pending', 'ethernet-dhcp-error'].includes(scenario)
                                ? 'disconnected'
                                : 'connected',
                      cable_connected: scenario !== 'ethernet-unplugged',
                      connection: 'Office LAN',
                      addresses:
                          scenario === 'ethernet-unplugged' || ['ethernet-auto', 'ethernet-pending', 'ethernet-dhcp-error'].includes(scenario)
                              ? []
                              : scenario === 'ethernet-ipv6'
                                ? ['2001:db8::2/64']
                                : ['10.0.0.2/24'],
                      gateway: '10.0.0.1',
                  },
              ]
            : [],
        primary_interface:
            scenario.startsWith('ethernet') &&
            !['ethernet-unplugged', 'ethernet-auto', 'ethernet-pending', 'ethernet-dhcp-error'].includes(scenario)
                ? 'enx123'
                : null,
        connectivity: scenario.startsWith('ethernet') ? 'limited' : 'unknown',
    },
});
window.isTauri = true;
window.__TAURI_INTERNALS__ = {
    invoke: async (command, args) => {
        state.calls.push({ command, args });
        if (command === 'get_app_mode') return true;
        if (command === 'get_network_status') {
            if (scenario === 'ethernet-status-error') throw 'Error: D-Bus failed NM_CONNECTION=secret-id';
            return structuredClone(state.network);
        }
        if (command === 'connect_ethernet') {
            if (scenario === 'ethernet-dhcp-error')
                throw 'Error: Connection activation failed: IP configuration could not be reserved (DHCP timeout). journalctl -xe NM_CONNECTION=secret-id';
            if (scenario === 'ethernet-pending')
                await new Promise((resolve) => {
                    state.pending = resolve;
                });
            state.network.ethernet[0].state = 'connected';
            state.network.ethernet[0].addresses = ['10.0.0.2/24'];
            state.network.primary_interface = 'enx123';
            return 'Ethernet connected.';
        }
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
            if (['scan-error', 'ethernet-scan-error'].includes(scenario)) throw 'Wi-Fi scan unavailable';
            return [network];
        }
        if (command === 'get_current_wifi_connection') return state.current;
        if (command === 'connect_to_wifi') {
            if (scenario === 'connect-error') throw 'Connection failed: authentication failed';
            if (scenario === 'missing-secret')
                throw "Connection failed: Warning: password for '802-11-wireless-security.psk' not given in 'passwd-file' and nmcli cannot ask without '--ask' option. Error: Connection activation failed: Secrets were required, but not provided. Hint: use journalctl -xe NM_CONNECTION=secret-id";
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
