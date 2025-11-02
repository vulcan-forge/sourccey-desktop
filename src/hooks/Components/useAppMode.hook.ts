import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { queryClient } from '@/hooks/default';

export const APP_MODE_KEY = ['app-mode'];

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
        // Default to desktop mode if there's an error
        return false;
    }
};

export const useAppMode = () => {
    const { data: isKioskMode = false, isLoading } = useQuery({
        queryKey: APP_MODE_KEY,
        queryFn: getAppMode,
        staleTime: Infinity, // Never refetch since app mode doesn't change
        gcTime: Infinity, // Keep in cache for 24 hours
    });

    return { isKioskMode, isLoading };
};
