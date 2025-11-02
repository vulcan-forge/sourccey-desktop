'use client';

import { AreKeysEqual, localStoragePersistor, queryClient } from '@/hooks/default';
import type { DehydrateOptions, QueryKey } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import React from 'react';
import { PROFILE_KEY } from '@/hooks/Models/Profile/profile.hook';
import { SYNC_DEFAULT_ROBOTS_KEY } from '@/hooks/Models/Robot/robot.hook';
import { RobotStatusProvider } from '@/context/robot-status-context';
import { VirtualKeyboardProvider } from '@/context/virtual-keyboard-context';

// SSH password status is now persisted via file system (not React Query)
const persistQueries: QueryKey[] = [PROFILE_KEY, SYNC_DEFAULT_ROBOTS_KEY];
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

export default function Provider({ children }: { children: React.ReactNode }) {
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
