import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { queryClient } from '@/hooks/default';

export const APP_MODE_KEY = ['app-mode'];

// Get app mode from cache or invoke
const getAppMode = async (): Promise<boolean> => {
    if (!isTauri()) {
        return false;
    }

    // Check cache first
    const cached = queryClient.getQueryData<boolean>(APP_MODE_KEY);
    if (cached !== undefined) {
        return cached;
    }

    try {
        const timeoutMs = 1500;
        const isKiosk = await Promise.race<boolean>([
            invoke<boolean>('get_app_mode'),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
        ]);
        return isKiosk;
    } catch (error) {
        console.error('Failed to get app mode:', error);
        // Default to desktop mode if there's an error
        return false;
    }
};

export const useAppMode = () => {
    const [isClient, setIsClient] = useState(false);
    const [isKioskPath, setIsKioskPath] = useState(false);

    useEffect(() => {
        setIsClient(true);
        setIsKioskPath(window.location.pathname.startsWith('/kiosk'));
    }, []);
    const { data, isLoading } = useQuery({
        queryKey: APP_MODE_KEY,
        queryFn: getAppMode,
        enabled: isClient && isTauri(),
        staleTime: Infinity, // Never refetch since app mode doesn't change
        gcTime: Infinity, // Keep in cache for 24 hours
    });

    return {
        isKioskMode: isClient ? (isKioskPath ? true : data ?? false) : false,
        isLoading: !isClient || (isKioskPath ? false : isLoading),
    };
};
