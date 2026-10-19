import { queryRobot, queryRobots, type GetRobotInput, type RobotListParameters } from '@/api/Rest/Robot';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

export const BASE_ROBOT_KEY = 'robot';

export const useGetRobot = (input: GetRobotInput) =>
    useQuery({
        queryKey: [BASE_ROBOT_KEY, input.id, input.name],
        queryFn: () => queryRobot(input),
    });

export const useGetRobots = (params: RobotListParameters = {}, enabled = true) =>
    useInfiniteQuery({
        queryKey: [BASE_ROBOT_KEY, 'infinite', params],
        queryFn: ({ pageParam }) => queryRobots({ ...params, cursor: pageParam }),
        initialPageParam: params.cursor ?? null,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        getPreviousPageParam: (page) => page.previousCursor ?? undefined,
        refetchOnWindowFocus: false,
        enabled,
    });
