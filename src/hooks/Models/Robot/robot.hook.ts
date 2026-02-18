import { getNextPageParam, getPreviousPageParam, setGraphQLParameters } from '@/api/GraphQL/Parameters';
import { queryRobot, queryRobots } from '@/api/GraphQL/Robot/Query';
import type { GetRobotInput } from '@/api/GraphQL/Robot/Types/GetRobot/GetInput';
import type { GraphQLPaginationParameters } from '@/types/GraphQL/GraphQLPaginationParameters';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

export const BASE_ROBOT_KEY = 'robot';

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
