import { getOwnedRobotById, getOwnedRobotByNickname, getOwnedRobots } from '@/api/Local/Robot/owned_robot';
import { useQuery } from '@tanstack/react-query';

export const BASE_OWNED_ROBOT_KEY = 'owned-robot';

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
