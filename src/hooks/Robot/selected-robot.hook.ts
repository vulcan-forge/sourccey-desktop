import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const SELECTED_ROBOT_KEY = ['selected-robot'];

export type SelectedRobot = {
    id: string;
    name: string;
    nickname: string;
    robotType: string;
    image?: string | null;
};

export const getSelectedRobot = () => queryClient.getQueryData<SelectedRobot | null>(SELECTED_ROBOT_KEY) ?? null;

export const setSelectedRobot = (robot: SelectedRobot | null) => queryClient.setQueryData(SELECTED_ROBOT_KEY, robot);

export const useSelectedRobot = () =>
    useQuery({
        queryKey: SELECTED_ROBOT_KEY,
        queryFn: () => getSelectedRobot(),
        staleTime: Infinity,
        gcTime: Infinity,
    });
