import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { queryClient } from '@/hooks/default';

export const APP_MODE_KEY = ['app-mode'];

const inferAppModeFromPathname = (): boolean | undefined => {
    if (typeof window === 'undefined') {
        return undefined;
    }

    const { pathname } = window.location;
    if (pathname.startsWith('/kiosk')) {
        return true;
    }
    if (pathname.startsWith('/desktop')) {
        return false;
    }

    return undefined;
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
        return inferAppModeFromPathname() ?? false;
    }
};

export const useAppMode = () => {
    const routeMode = inferAppModeFromPathname();
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
