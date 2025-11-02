import { getNextPageParam, getPreviousPageParam, setGraphQLParameters } from '@/api/GraphQL/Parameters';
import { queryRobot, queryRobots } from '@/api/GraphQL/Robot/Query';
import type { GetRobotInput } from '@/api/GraphQL/Robot/Types/GetRobot/GetInput';
import { syncDefaultRobots } from '@/api/Local/Sync/sync_robots';
import type { GraphQLPaginationParameters } from '@/types/GraphQL/GraphQLPaginationParameters';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/hooks/default';

export const BASE_ROBOT_KEY = 'robot';
export const SYNC_DEFAULT_ROBOTS_KEY = [BASE_ROBOT_KEY, 'sync', 'default'];

const REQUIRED_SYNC_TIME = new Date('2025-10-09T00:00:00.000Z');

//---------------------------------------------------------------------------------------------------//
// Robot Hooks and Functions
//---------------------------------------------------------------------------------------------------//

export const useGetRobot = (input: GetRobotInput) =>
    useQuery({
        queryKey: [BASE_ROBOT_KEY, input.id, input.name],
        queryFn: async () => {
            return await queryRobot(input);
        },
    });

export const useGetRobots = (params: GraphQLPaginationParameters = {}, enabled = true) =>
    useInfiniteQuery({
        queryKey: [BASE_ROBOT_KEY, 'infinite', params.where],
        queryFn: async ({ pageParam }) => {
            if (!enabled) return null;
            setGraphQLParameters(params, pageParam);
            return await queryRobots(params);
        },
        initialPageParam: null,
        getNextPageParam: getNextPageParam,
        getPreviousPageParam: getPreviousPageParam,
        refetchOnWindowFocus: false,
        enabled,
    });

//---------------------------------------------------------------------------------------------------//
// Robot Sync Functions
//---------------------------------------------------------------------------------------------------//

export const useSyncDefaultRobots = () => {
    return useMutation({
        mutationKey: SYNC_DEFAULT_ROBOTS_KEY,
        mutationFn: async () => {
            // Check if sync has already been completed successfully
            const lastSyncTime = queryClient.getQueryData(SYNC_DEFAULT_ROBOTS_KEY);

            let lastSyncTimeDate = null;
            if (!!lastSyncTime) lastSyncTimeDate = new Date(lastSyncTime as string);
            if (lastSyncTimeDate && lastSyncTimeDate > REQUIRED_SYNC_TIME) {
                console.info('Default Robots Sync has already been completed successfully');
                return lastSyncTime;
            }

            await syncDefaultRobots();

            const syncTime = new Date();
            return syncTime;
        },
    });
};
