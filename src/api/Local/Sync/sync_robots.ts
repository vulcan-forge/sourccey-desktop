import { invoke } from '@tauri-apps/api/core';
import { queryRobots } from '@/api/GraphQL/Robot/Query';
import { toast } from 'react-toastify';
import { formatDateTimeISO8601 } from '@/utils/datetime';
import defaultRobotsData from '../../../../data/default_robots.json';
import { toastErrorDefaults, toastInfoDefaults, toastSuccessDefaults, toastWarningDefaults } from '@/utils/toast/toast-utils';

export interface SyncOptions {
    robotsPerPage?: number;
    maxPages?: number;
    onProgress?: (page: number, totalPages: number, syncedCount: number) => void;
    onlyUpdatedSinceLastSync?: boolean;
}

export interface SyncResult {
    totalSynced: number;
    pagesProcessed: number;
    success: boolean;
    error?: string;
    lastSyncAt?: string;
}

//----------------------------------------------------------//
// Local Sync Functions
//----------------------------------------------------------//
const loadDefaultRobots = async (): Promise<any[]> => {
    try {
        // Transform the default robots data to match the expected format
        const defaultRobots = defaultRobotsData.map((robot: any) => ({
            id: robot.id,
            name: robot.name,
            long_name: robot.long_name,
            description: robot.description,
            short_description: robot.short_description,
            image: robot.image,
            robot_type: robot.robot_type,
            github_url: robot.github_url,
            created_at: robot.created_at,
            updated_at: robot.updated_at,
            deleted_at: null,
        }));

        return defaultRobots;
    } catch (error) {
        console.error('Error loading default robots:', error);
        toast.error('Failed to load default robots from JSON file', { ...toastErrorDefaults });
        return [];
    }
};

export const syncDefaultRobots = async (options: Omit<SyncOptions, 'onlyUpdatedSinceLastSync'> = {}): Promise<SyncResult> => {
    const { onProgress } = options;

    try {
        console.info('Syncing default robots from local JSON file...');

        // Load default robots from JSON
        const defaultRobots = await loadDefaultRobots();
        if (defaultRobots.length === 0) {
            console.warn('No default robots found in JSON file');
            toast.warning('No default robots found in JSON file', { ...toastWarningDefaults });
            return {
                totalSynced: 0,
                pagesProcessed: 0,
                success: true,
                error: 'No default robots found in JSON file',
            };
        }

        // Sync the default robots to the database
        let syncResult: any;
        try {
            syncResult = await invoke('sync_robots', {
                request: { robots: defaultRobots },
            });
        } catch (error) {
            console.error('error', error);
            // Handle case where Tauri backend is not available
            if (error instanceof Error && error.message.includes('ERR_CONNECTION_REFUSED')) {
                console.warn('Tauri backend not available, skipping sync');
                toast.warning('Tauri backend not available - sync skipped', { ...toastWarningDefaults });
                return {
                    totalSynced: 0,
                    pagesProcessed: 0,
                    success: true,
                    error: 'Tauri backend not available',
                };
            }
            throw error; // Re-throw other errors
        }

        const totalSynced = syncResult.synced_records || 0;

        console.info(`Synced ${totalSynced} default robots`);
        if (onProgress) {
            onProgress(1, 1, totalSynced);
        }
        return {
            totalSynced,
            pagesProcessed: 1,
            success: true,
            lastSyncAt: new Date().toISOString(),
        };
    } catch (error) {
        toast.error(`Failed to sync default robots: ${error instanceof Error ? error.message : 'Unknown error'}`, { ...toastErrorDefaults });
        return {
            totalSynced: 0,
            pagesProcessed: 0,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};

export const syncDefaultRobotsWithNotifications = async (options: Omit<SyncOptions, 'onlyUpdatedSinceLastSync'> = {}): Promise<SyncResult> => {
    const result = await syncDefaultRobots({
        ...options,
        onProgress: (page, totalPages, syncedCount) => {
            console.info(`Default robots progress: ${page}/${totalPages} pages, ${syncedCount} robots synced`);
        },
    });

    if (result.success) {
        if (result.totalSynced === 0) {
            toast.success('No default robots to sync!', { ...toastSuccessDefaults });
        } else {
            toast.success(`Successfully synced ${result.totalSynced} default robots!`, { ...toastSuccessDefaults });
        }
    } else {
        toast.error(`Failed to sync default robots: ${result.error}`, { ...toastErrorDefaults });
    }

    return result;
};

//----------------------------------------------------------//
// Database Sync Functions
//----------------------------------------------------------//
export const syncRobots = async (options: SyncOptions = {}): Promise<SyncResult> => {
    const { robotsPerPage = 300, maxPages = 1, onProgress, onlyUpdatedSinceLastSync = true } = options;

    let totalSynced = 0;
    let currentCursor: string | null = null;
    let pagesProcessed = 0;
    let lastSyncAt: string | null = null;

    try {
        console.info('Starting robot sync from API...');
        toast.info('Syncing robots from server...', { ...toastInfoDefaults });

        // Get last sync timestamp if we're only syncing updated robots
        if (onlyUpdatedSinceLastSync) {
            lastSyncAt = await getLastSyncTimestamp();
            console.info('Last sync timestamp:', lastSyncAt);
            toast.info(`Last sync timestamp: ${lastSyncAt}`, { ...toastInfoDefaults });
        }

        // Build query parameters
        const order = `{updated_at: DESC}`;
        for (let page = 0; page < maxPages; page++) {
            console.info(`Syncing page ${page + 1}/${maxPages}...`);

            const queryParams: any = {
                first: robotsPerPage,
                order,
            };

            if (currentCursor) {
                queryParams.after = `"${currentCursor}"`;
            }

            if (onlyUpdatedSinceLastSync && lastSyncAt) {
                queryParams.where = `{updated_at: {gt: "${lastSyncAt}"}}`;
            }

            const pageResult = await queryRobots(queryParams);
            if (!pageResult.edges || pageResult.edges.length === 0) {
                console.info('No more robots to sync');
                break;
            }
            const robots = pageResult.edges.map((edge: any) => edge.node);

            // If we're only syncing updated robots and this is the first page with no updates, break early
            if (onlyUpdatedSinceLastSync && lastSyncAt && page === 0 && robots.length === 0) {
                console.info('No robots have been updated since last sync');
                toast.info('All robots are already up to date!', { ...toastInfoDefaults });
                break;
            }

            // Sync this batch of robots
            let syncResult: any;
            try {
                syncResult = await invoke('sync_robots', {
                    request: { robots },
                });
            } catch (error) {
                // Handle case where Tauri backend is not available
                if (error instanceof Error && error.message.includes('ERR_CONNECTION_REFUSED')) {
                    console.warn('Tauri backend not available, skipping sync');
                    toast.warning('Tauri backend not available - sync skipped', { ...toastWarningDefaults });
                    return {
                        totalSynced,
                        pagesProcessed,
                        success: true,
                        error: 'Tauri backend not available',
                        lastSyncAt: lastSyncAt || undefined,
                    };
                }
                throw error; // Re-throw other errors
            }

            totalSynced += syncResult.synced_records || 0;
            pagesProcessed++;

            console.info(`Synced ${robots.length} robots (total: ${totalSynced})`);
            if (onProgress) {
                onProgress(page + 1, maxPages, totalSynced);
            }

            // Add a small delay to prevent overwhelming the system
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Check if there are more pages
            if (!pageResult.pageInfo?.hasNextPage) {
                console.info('No more pages available');
                break;
            }

            currentCursor = pageResult.pageInfo.endCursor;
        }

        console.info(`Sync completed! Total synced: ${totalSynced}`);

        return {
            totalSynced,
            pagesProcessed,
            success: true,
            lastSyncAt: lastSyncAt || undefined,
        };
    } catch (error) {
        console.error('Error syncing robots:', error);
        toast.error(`Failed to sync robots: ${error instanceof Error ? error.message : 'Unknown error'}`, { ...toastErrorDefaults });
        return {
            totalSynced,
            pagesProcessed,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            lastSyncAt: lastSyncAt || undefined,
        };
    }
};

export const syncRobotsWithNotifications = async (options: SyncOptions = {}): Promise<SyncResult> => {
    const result = await syncRobots({
        ...options,
        onProgress: (page, totalPages, syncedCount) => {
            console.info(`Progress: ${page}/${totalPages} pages, ${syncedCount} robots synced`);
        },
    });

    if (result.success) {
        if (result.totalSynced === 0) {
            toast.success('All robots are up to date!', { ...toastSuccessDefaults });
        } else {
            toast.success(`Successfully synced ${result.totalSynced} robots!`, { ...toastSuccessDefaults });
        }
    } else {
        toast.error(`Failed to sync robots: ${result.error}`, { ...toastErrorDefaults });
    }

    return result;
};

export const syncRobotsWithProgress = async (
    onProgress: (page: number, totalPages: number, syncedCount: number) => void,
    options: Omit<SyncOptions, 'onProgress'> = {}
): Promise<SyncResult> => {
    return syncRobots({
        ...options,
        onProgress,
    });
};

export const forceSyncAllRobots = async (options: Omit<SyncOptions, 'onlyUpdatedSinceLastSync'> = {}): Promise<SyncResult> => {
    toast.info('Force syncing all robots...', { ...toastInfoDefaults });
    return syncRobots({
        ...options,
        onlyUpdatedSinceLastSync: false,
    });
};

const getLastSyncTimestamp = async (): Promise<string | null> => {
    try {
        const syncStatus: any = await invoke('get_sync_status');
        if (!syncStatus) {
            console.info('No sync status found - this might be the first sync');
            return null;
        }

        const lastSyncAt = syncStatus.last_sync_at;
        if (!lastSyncAt) {
            console.info('No last sync timestamp found - this might be the first sync');
            return null;
        }

        // Format the DateTime to valid ISO-8601 format
        const formattedDateTime = formatDateTimeISO8601(lastSyncAt);
        return formattedDateTime;
    } catch (error) {
        // Handle case where Tauri backend is not available
        if (error instanceof Error && error.message.includes('ERR_CONNECTION_REFUSED')) {
            console.warn('Tauri backend not available, cannot get sync status');
            return null;
        }
        console.error('Error getting sync status:', error);
        toast.error('Failed to get last sync timestamp', { ...toastErrorDefaults });
        return null;
    }
};
