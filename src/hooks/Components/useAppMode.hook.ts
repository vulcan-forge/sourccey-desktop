import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { queryClient } from '@/hooks/default';
import { usePathname } from 'next/navigation';

export const APP_MODE_KEY = ['app-mode'];

const inferAppModeFromPathname = (pathname?: string | null): boolean | undefined => {
    if (!pathname) {
        return undefined;
    }

    if (pathname.startsWith('/kiosk')) {
        return true;
    }
    if (pathname.startsWith('/desktop')) {
        return false;
    }

    return undefined;
};

const inferAppModeFromWindow = (): boolean | undefined => {
    if (typeof window === 'undefined') {
        return undefined;
    }

    return inferAppModeFromPathname(window.location.pathname);
};

// Get app mode from cache or invoke
const getAppMode = async (): Promise<boolean> => {
    // Check cache first
    const cached = queryClient.getQueryData<boolean>(APP_MODE_KEY);
    if (cached !== undefined) {
        return cached;
    }

    try {
        const isKiosk = await invoke<boolean>('get_app_mode');
        return isKiosk;
    } catch (error) {
        console.error('Failed to get app mode:', error);
        // In dev/startup races, fallback to current route instead of forcing desktop.
        return inferAppModeFromWindow() ?? false;
    }
};

export const useAppMode = () => {
    const pathname = usePathname();
    const routeMode = inferAppModeFromPathname(pathname);
    const { data, isLoading } = useQuery({
        queryKey: APP_MODE_KEY,
        queryFn: getAppMode,
        staleTime: Infinity, // Never refetch since app mode doesn't change
        gcTime: Infinity, // Keep in cache for 24 hours
    });

    return {
        isKioskMode: data ?? routeMode ?? false,
        isLoading: routeMode === undefined ? isLoading : false,
    };
};
