import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_EPISODE_KEY = 'episode';
export const EPISODE_NUMBER_KEY = (nickname: string, dataset: string) => [BASE_EPISODE_KEY, 'number', nickname, dataset];
export const EPISODE_SIDEBAR_KEY = () => [BASE_EPISODE_KEY, 'sidebar'];

//---------------------------------------------------------------------------------------------------//
// Episode Number
//--------------------------------------------------------------------------------------------------//
export const getEpisodeNumber = (nickname: string, dataset: string) => queryClient.getQueryData(EPISODE_NUMBER_KEY(nickname, dataset)) ?? 0;
export const setEpisodeNumber = (nickname: string, dataset: string, number: number) => {
    queryClient.setQueryData(EPISODE_NUMBER_KEY(nickname, dataset), number);
};
export const useGetEpisodeNumber = (nickname: string, dataset: string) => useQuery({ queryKey: EPISODE_NUMBER_KEY(nickname, dataset), queryFn: () => getEpisodeNumber(nickname, dataset) });

//---------------------------------------------------------------------------------------------------//
// Episode Sidebar
//---------------------------------------------------------------------------------------------------//
export const getEpisodeSidebar = () => queryClient.getQueryData(EPISODE_SIDEBAR_KEY()) ?? false;
export const setEpisodeSidebar = (toggle: boolean) => {
    queryClient.setQueryData(EPISODE_SIDEBAR_KEY(), toggle);
};
export const useGetEpisodeSidebar = () => useQuery({ queryKey: EPISODE_SIDEBAR_KEY(), queryFn: () => getEpisodeSidebar() });
