import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_OWNED_ROBOTS_KEY = 'owned-robots';
export const OWNED_ROBOTS_CONTENT_KEY = [BASE_OWNED_ROBOTS_KEY, 'content'];

//---------------------------------------------------------------------------------------------------//
// Owned Robot Content Functions
//---------------------------------------------------------------------------------------------------//
export const getContent = () => queryClient.getQueryData(OWNED_ROBOTS_CONTENT_KEY);
export const setContent = (content: any) => queryClient.setQueryData(OWNED_ROBOTS_CONTENT_KEY, content);
export const useGetContent = () => useQuery({ queryKey: OWNED_ROBOTS_CONTENT_KEY, queryFn: () => getContent() ?? 'overview' });
//---------------------------------------------------------------------------------------------------//
