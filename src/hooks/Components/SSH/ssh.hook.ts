import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/hooks/default';
import { invoke } from '@tauri-apps/api/core';

const BASE_SSH_KEY = 'ssh';
export const SSH_PASSWORD_CHANGED_KEY = [BASE_SSH_KEY, 'password-changed'];

//---------------------------------------------------------------------------------------------------//
// SSH Password Changed Tracking (File-based persistence via Tauri)
//---------------------------------------------------------------------------------------------------//

/**
 * Get the current password changed status from persistent file storage
 */
export const getPasswordChangedStatus = async (): Promise<boolean> => {
    try {
        const result = await invoke<boolean>('get_ssh_password_changed_status');
        return result;
    } catch (error) {
        console.error('Failed to get SSH password changed status:', error);
        return false;
    }
};

/**
 * Set the password changed status in persistent file storage
 */
export const setPasswordChangedStatus = async (hasChanged: boolean): Promise<void> => {
    try {
        await invoke('set_ssh_password_changed_status', { changed: hasChanged });
        // Also update the query cache so UI updates immediately
        queryClient.setQueryData(SSH_PASSWORD_CHANGED_KEY, hasChanged);
    } catch (error) {
        console.error('Failed to set SSH password changed status:', error);
        throw error;
    }
};

/**
 * Mark the password as changed (one-way, permanent)
 */
export const markPasswordAsChanged = async (): Promise<void> => {
    await setPasswordChangedStatus(true);
};

/**
 * Hook to get the password changed status
 * Returns false by default if never set
 */
export const usePasswordChangedStatus = () => {
    return useQuery({
        queryKey: SSH_PASSWORD_CHANGED_KEY,
        queryFn: getPasswordChangedStatus,
        staleTime: Infinity, // Never consider this stale
        gcTime: Infinity, // Never garbage collect this query
    });
};

/**
 * Hook to mark password as changed
 * Returns a mutation function that sets the status to true
 */
export const useMarkPasswordAsChanged = () => {
    return useMutation({
        mutationFn: async () => {
            markPasswordAsChanged();
            return true;
        },
    });
};



