'use client';

import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { setDatasetSyncAccount } from '@/api/Local/AI/upload';
import { useAuthSession } from '@/hooks/Auth/auth-session.hook';

export function DatasetSyncAccountBridge() {
    const { data: session } = useAuthSession();
    const lastAccountId = useRef<string | null | undefined>(undefined);
    const accountId = session?.isAuthenticated ? session.accountId : null;

    useEffect(() => {
        // Wait for the persisted auth query to hydrate before treating a
        // missing session as an intentional sign-out.
        if (!isTauri() || !session?.updatedAt || lastAccountId.current === accountId) return;

        lastAccountId.current = accountId;
        void setDatasetSyncAccount(accountId).catch((error) => {
            lastAccountId.current = undefined;
            console.error('[dataset-sync] failed to associate installation with account', {
                accountId,
                error,
            });
        });
    }, [accountId, session?.updatedAt]);

    return null;
}
