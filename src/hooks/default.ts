import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';

const MINUTE = 1000 * 60;

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            gcTime: 10 * MINUTE,
        },
    },
});

export const localStoragePersistor = createSyncStoragePersister({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
});

export const AreKeysEqual = (key1: any, key2: any) => {
    try {
        if (!key1 || !key2) return false;
        if (key1.length !== key2.length) return false;
        for (let i = 0; i < key1.length; i++) {
            if (key1[i] !== key2[i]) return false;
        }
        return true;
    } catch {
        return false;
    }
};
