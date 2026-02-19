import { getOwnedRobotById, getOwnedRobotByNickname, getOwnedRobots } from '@/api/Local/Robot/owned_robot';
import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_OWNED_ROBOT_KEY = 'owned-robot';

export const SELECTED_OWNED_ROBOT_KEY = ['selected-owned-robot'];

//---------------------------------------------------------------------------------------------------//
// Owned Robot Hooks and Functions
//---------------------------------------------------------------------------------------------------//

export const useGetOwnedRobot = (id: string) => {
    return useQuery({
        queryKey: [BASE_OWNED_ROBOT_KEY, 'id', id],
        queryFn: async () => {
            return await getOwnedRobotById(id);
        },
    });
};

export const useGetOwnedRobotByNickname = (nickname: string) => {
    return useQuery({
        queryKey: [BASE_OWNED_ROBOT_KEY, 'nickname', nickname],
        queryFn: async () => {
            return await getOwnedRobotByNickname(nickname);
        },
    });
};

export const useGetOwnedRobots = (enabled: boolean = true) => {
    return useQuery({
        queryKey: [BASE_OWNED_ROBOT_KEY],
        queryFn: async () => {
            return await getOwnedRobots();
        },
        enabled,
    });
};

//---------------------------------------------------------------------------------------------------//
// Selected Owned Robot Hooks and Functions
//---------------------------------------------------------------------------------------------------//
export const getSelectedOwnedRobot = () => queryClient.getQueryData<any | null>(SELECTED_OWNED_ROBOT_KEY) ?? null;

export const setSelectedOwnedRobot = (robot: any | null) => queryClient.setQueryData(SELECTED_OWNED_ROBOT_KEY, robot);

export const useSelectedOwnedRobot = () =>
    useQuery({
        queryKey: SELECTED_OWNED_ROBOT_KEY,
        queryFn: () => getSelectedOwnedRobot(),
        staleTime: Infinity,
        gcTime: Infinity,
    });
