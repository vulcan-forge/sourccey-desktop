import { getAllRobots } from '@/api/Local/Robot/robot';
import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_ROBOT_KEY = 'robot';
export const ROBOT_STATE_KEY = [BASE_ROBOT_KEY, 'state'];
export const ALL_ROBOTS_KEY = [BASE_ROBOT_KEY, 'all'];

//---------------------------------------------------------------------------------------------------//
// Robot Hook Functions
//---------------------------------------------------------------------------------------------------//
export const getState = () => queryClient.getQueryData(ROBOT_STATE_KEY);
export const setState = (state: any) => queryClient.setQueryData(ROBOT_STATE_KEY, state);
export const useGetState = () =>
    useQuery({ queryKey: ROBOT_STATE_KEY, queryFn: () => getState() ?? { showAllRobots: true, selectedRobot: null } });
//---------------------------------------------------------------------------------------------------//

//---------------------------------------------------------------------------------------------------//
// All Robots Functions
//---------------------------------------------------------------------------------------------------//
export const useGetAllRobots = () => useQuery({ queryKey: ALL_ROBOTS_KEY, queryFn: () => getAllRobots() ?? [] });
//---------------------------------------------------------------------------------------------------//
