'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

function readURL(): URL {
    return new URL(window.location.href);
}

function subscribeURL(cb: () => void) {
    const handler = () => cb();
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
}

export function useQueryValue(key: string) {
    const getSnapshot = () => (typeof window === 'undefined' ? '' : (readURL().searchParams.get(key) ?? ''));
    const getServerSnapshot = () => '';
    const value = useSyncExternalStore(subscribeURL, getSnapshot, getServerSnapshot);
    return value;
}

export function setQueryParams(next: Record<string, string | null>, opts?: { replace?: boolean }) {
    const url = readURL();
    const sp = url.searchParams;

    Object.entries(next).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') sp.delete(k);
        else sp.set(k, String(v));
    });

    url.search = sp.toString();
    if (opts?.replace) history.replaceState({}, '', url.toString());
    else history.pushState({}, '', url.toString());

    // Fire a manual pop-like notification for components using useSyncExternalStore
    dispatchEvent(new PopStateEvent('popstate'));
}
