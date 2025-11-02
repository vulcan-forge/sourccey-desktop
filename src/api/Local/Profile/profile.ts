import type { Profile } from '@/types/Models/profile';
import { invoke } from '@tauri-apps/api/core';
import { v7 as uuidv7 } from 'uuid';

const LOCAL_PROFILE_ID_STORAGE_KEY = 'local_profile_id';

// Helper functions for localStorage
export const getProfileId = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(LOCAL_PROFILE_ID_STORAGE_KEY);
};

export const setProfileId = (profile_id: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LOCAL_PROFILE_ID_STORAGE_KEY, profile_id);
};

export async function getProfile(): Promise<Profile | null> {
    try {
        // Get profile ID from localStorage
        const profileId = getProfileId();

        if (profileId) {
            // Try to get existing profile by ID
            const existingProfile = await invoke<Profile | null>('get_profile_by_id', {
                id: profileId,
            });

            if (existingProfile) {
                console.log('✅ Found existing profile with ID:', existingProfile.id);
                return existingProfile;
            }
        }

        // Try to get the first available profile
        const firstProfile = await invoke<Profile | null>('get_first_profile');
        if (firstProfile) {
            console.log('✅ Found first available profile with ID:', firstProfile.id);
            // Save this profile ID for future use
            setProfileId(firstProfile.id);
            return firstProfile;
        }

        // No profile found - return null (user needs to create one or log in)
        console.warn('⚠️ No profile found. User needs to create a profile or log in.');
        return null;
    } catch (error) {
        console.error('❌ Error getting profile:', error);
        // For development, you could return a temporary profile here if needed
        // But for production, we should return null and handle this properly
        return null;
    }
}

export interface CreateProfileRequest {
    account_id?: string;
    handle: string;
    name?: string;
    image?: string;
    bio?: string;
}

export interface UpdateProfileRequest {
    name?: string;
    image?: string;
    bio?: string;
}

/**
 * Get or create a profile by handle
 * If a profile with the given handle exists, it returns it
 * If no profile exists, it creates a new one with the provided data
 */
export async function getOrCreateProfile(profile_id: string | null): Promise<Profile> {
    try {
        // First, try to get the existing profile
        if (profile_id) {
            const existingProfile = await invoke<Profile | null>('get_profile_by_id', {
                id: profile_id,
            });

            if (existingProfile) {
                console.info('Found existing profile:', existingProfile);
                return existingProfile;
            }
        }

        // If no profile exists, create a new one
        const createData: CreateProfileRequest = {
            handle: uuidv7(),
        };
        console.info('No profile found, creating new one with handle:', createData.handle);
        const newProfile = await invoke<Profile>('create_profile', {
            request: {
                ...createData,
            },
        });

        console.info('Created new profile:', newProfile);
        setProfileId(newProfile.id);
        return newProfile;
    } catch (error) {
        console.error('Error in getOrCreateProfile:', error);
        throw error;
    }
}

/**
 * Get a profile by ID
 */
export async function getProfileById(id: string): Promise<Profile | null> {
    try {
        return await invoke<Profile | null>('get_profile_by_id', { id });
    } catch (error) {
        console.error('Error getting profile by ID:', error);
        throw error;
    }
}
/**
 * Create a new profile
 */
export async function createProfile(request: CreateProfileRequest): Promise<Profile> {
    try {
        return await invoke<Profile>('create_profile', { request });
    } catch (error) {
        console.error('Error creating profile:', error);
        throw error;
    }
}
