'use client';

import { isTauri } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { setAuthSession } from '@/hooks/Auth/auth-session.hook';
import {
    DESKTOP_OAUTH_RESULT_EVENT,
    DESKTOP_OAUTH_RESULT_STORAGE_KEY,
    type DesktopOAuthResultPayload,
    normalizeOAuthProvider,
} from '@/utils/auth/desktop-oauth';
import { useLayoutEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const CALLBACK_CLEANUP_URL = '/desktop/account';

const sanitizePayload = (payload: DesktopOAuthResultPayload) => {
    return {
        ...payload,
        email: payload.email?.trim() ?? null,
        error: payload.error?.trim() ?? null,
    };
};

const persistDesktopOAuthPayload = (payload: DesktopOAuthResultPayload) => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(DESKTOP_OAUTH_RESULT_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.error('[desktop-oauth-callback] failed to persist desktop social login result', {
            error,
            payload,
        });
    }
};

export default function DesktopOAuthCallbackPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const hasHandledCallbackRef = useRef(false);

    useLayoutEffect(() => {
        if (hasHandledCallbackRef.current) {
            return;
        }

        const status = searchParams.get('status');
        if (!status || typeof window === 'undefined') {
            return;
        }

        hasHandledCallbackRef.current = true;

        const payload = sanitizePayload({
            status: status === 'success' ? 'success' : 'error',
            provider: normalizeOAuthProvider(searchParams.get('provider')),
            accountId: searchParams.get('accountId')?.trim() ?? null,
            email: searchParams.get('email')?.trim() ?? null,
            error: searchParams.get('error'),
        });

        if (!isTauri() && payload.status === 'success' && payload.provider && payload.accountId && payload.email) {
            setAuthSession({
                isAuthenticated: true,
                accountId: payload.accountId,
                email: payload.email,
                provider: payload.provider,
                profileHandle: null,
                profileName: null,
                accountRole: null,
                subscriptionTier: null,
                tokenBalance: null,
            });
        }

        if (isTauri()) {
            const currentWindow = getCurrentWebviewWindow();
            persistDesktopOAuthPayload(payload);
            void currentWindow
                .hide()
                .catch(() => null)
                .finally(async () => {
                    await Promise.race([
                        emit(DESKTOP_OAUTH_RESULT_EVENT, payload).catch((error) => {
                            console.error('[desktop-oauth-callback] failed to forward desktop social login result', {
                                error,
                                payload,
                            });
                        }),
                        new Promise((resolve) => window.setTimeout(resolve, 300)),
                    ]);

                    void currentWindow.close();
                });
            return;
        }

        router.replace(CALLBACK_CLEANUP_URL);
    }, [router, searchParams]);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6">
                <div className="text-center text-sm text-slate-400">Finishing sign-in...</div>
            </div>
        </div>
    );
}
