// @ts-nocheck
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import AccountPage from '../../src/app/desktop/account/page';
import DeveloperPage from '../../src/app/desktop/settings/developer/page';
import { queryClient } from '../../src/hooks/default';
import { resolveClientDesktopEnvironmentSettings } from '../../src/environments/environment';
import { queryRobots } from '../../src/api/Rest/Robot';

const scenario = new URLSearchParams(location.search);
const state = window.__restTest = {
    calls: [],
    settings: resolveClientDesktopEnvironmentSettings({ environment: 'production' }),
    catalog: () => queryRobots({ limit: 5, cursor: 'opaque+/=', search: 'robot & one' }),
};
if (scenario.get('native') === 'true') {
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
        metadata: { currentWebview: { label: 'main' }, currentWindow: { label: 'main' } },
        transformCallback: () => 1,
        unregisterCallback: () => {},
        invoke: async (command, args) => {
            state.calls.push({ command, args });
            if (command === 'get_desktop_environment_settings') return state.settings;
            if (command === 'save_desktop_environment_settings') {
                state.settings = resolveClientDesktopEnvironmentSettings(args.settings);
                return state.settings;
            }
            if (command === 'desktop_login_via_studio') {
                return scenario.has('error')
                    ? { status: 401, body: { detail: 'Invalid email or password.', code: 'invalid_credentials' } }
                    : { status: 200, body: { account: { id: 'native-account', email: args.request.email, role: 'USER' } } };
            }
            if (command === 'desktop_get_robot_catalog') return { status: 200, body: { items: [], totalCount: 0, nextCursor: null, previousCursor: null } };
            if (command === 'plugin:window|get_all_windows') return [];
            if (command.startsWith('plugin:event|') || command === 'plugin:webview|create_webview_window') return 1;
            throw new Error(`Unexpected native command: ${command}`);
        },
    };
}

createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={queryClient}>
        {location.pathname === '/developer' ? <DeveloperPage /> : <AccountPage />}
        <ToastContainer />
    </QueryClientProvider>
);
