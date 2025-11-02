import { getOrCreateProfile, getProfile, getProfileId } from '@/api/Local/Profile/profile';
import type { Profile } from '@/types/Models/profile';
import { useQuery } from '@tanstack/react-query';

export const BASE_PROFILE_KEY = 'profile';
export const PROFILE_KEY = [BASE_PROFILE_KEY];

export const useGetProfile = () => {
    return useQuery({
        queryKey: PROFILE_KEY,
        queryFn: async (): Promise<Profile | null> => {
            return await getProfile();
        },
        staleTime: Infinity, // Never goes stale - data is always considered fresh
        gcTime: Infinity, // Never garbage collected - stays in cache forever
        refetchOnWindowFocus: false, // Don't refetch when window regains focus
        refetchOnMount: false, // Don't refetch when component mounts
        refetchOnReconnect: false, // Don't refetch when reconnecting to network
    });
};

export const useGetOrCreateProfile = () => {
    return useQuery({
        queryKey: PROFILE_KEY,
        queryFn: async (): Promise<Profile | null> => {
            const profileId = getProfileId();
            return await getOrCreateProfile(profileId);
        },
        staleTime: Infinity, // Never goes stale - data is always considered fresh
        gcTime: Infinity, // Never garbage collected - stays in cache forever
        refetchOnWindowFocus: false, // Don't refetch when window regains focus
        refetchOnMount: false, // Don't refetch when component mounts
        refetchOnReconnect: false, // Don't refetch when reconnecting to network
    });
};
