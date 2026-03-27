'use client';

import { AreKeysEqual, localStoragePersistor, queryClient } from '@/hooks/default';
import type { DehydrateOptions, QueryKey } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import React from 'react';
import { RobotStatusProvider } from '@/context/robot-status-context';
import { VirtualKeyboardProvider } from '@/context/virtual-keyboard-context';
import { ACCESS_POINT_ENABLED_KEY, ACCESS_POINT_PASSWORD_KEY, ACCESS_POINT_SSID_KEY } from '@/hooks/WIFI/access-point.hook';
import { SAVED_WIFI_SSIDS_KEY } from '@/hooks/WIFI/wifi.hook';
import { SELECTED_ROBOT_KEY } from '@/hooks/Robot/selected-robot.hook';
import { SELECTED_MODEL_KEY } from '@/hooks/AI/selected-model.hook';
import { PAIRED_ROBOT_CONNECTIONS_KEY } from '@/hooks/Robot/paired-robot-connection.hook';
import { DESKTOP_EXTRAS_KEY } from '@/hooks/System/setup-desktop-extras.hook';
import { AUTH_SESSION_KEY } from '@/hooks/Auth/auth-session.hook';

// SSH password status is now persisted via file system (not React Query)
const persistQueries: QueryKey[] = [
    SAVED_WIFI_SSIDS_KEY,
    ACCESS_POINT_ENABLED_KEY,
    ACCESS_POINT_SSID_KEY,
    SELECTED_ROBOT_KEY,
    SELECTED_MODEL_KEY,
    DESKTOP_EXTRAS_KEY,
    AUTH_SESSION_KEY,
];
const dehydrateOptions: DehydrateOptions = {
    shouldDehydrateQuery: ({ queryKey }) => {
        for (const key of persistQueries) {
            if (AreKeysEqual(queryKey, key)) return true;
        }
        return false;
    },
};
const persistOptions = {
    persister: localStoragePersistor,
    hydrateOptions: {},
    dehydrateOptions: dehydrateOptions,
};

const REACT_QUERY_STORAGE_KEY = 'REACT_QUERY_OFFLINE_CACHE';
const sensitiveQueryKeys: QueryKey[] = [ACCESS_POINT_PASSWORD_KEY, PAIRED_ROBOT_CONNECTIONS_KEY];

const scrubSensitivePersistedQueries = () => {
    if (typeof window === 'undefined') return;

    try {
        const raw = window.localStorage.getItem(REACT_QUERY_STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw) as {
            clientState?: { queries?: Array<{ queryKey?: QueryKey }> };
        };

        const queries = parsed?.clientState?.queries;
        if (!Array.isArray(queries)) return;

        const filtered = queries.filter(
            (query) => !sensitiveQueryKeys.some((key) => AreKeysEqual(query?.queryKey, key))
        );

        if (filtered.length !== queries.length) {
            parsed.clientState!.queries = filtered;
            window.localStorage.setItem(REACT_QUERY_STORAGE_KEY, JSON.stringify(parsed));
        }
    } catch {
        // Best-effort scrub only; ignore malformed cache payloads.
    }
};

export default function Provider({ children }: { children: React.ReactNode }) {
    React.useEffect(() => {
        scrubSensitivePersistedQueries();
        for (const key of sensitiveQueryKeys) {
            queryClient.removeQueries({ queryKey: key, exact: true });
        }
    }, []);

    return (
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
            <RobotStatusProvider>
                <VirtualKeyboardProvider>
                    {children}
                    <ReactQueryDevtools initialIsOpen={true} />
                </VirtualKeyboardProvider>
            </RobotStatusProvider>
        </PersistQueryClientProvider>
    );
}
