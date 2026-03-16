import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const AUTH_SESSION_KEY = ['auth', 'session'];

export type AuthProvider = 'credentials' | 'google' | 'github' | 'unknown';

export type AuthSession = {
    isAuthenticated: boolean;
    accountId: string | null;
    email: string | null;
    provider: AuthProvider | null;
    subscriptionTier: string | null;
    tokenBalance: number | null;
    profileHandle: string | null;
    profileName: string | null;
    accountRole: string | null;
    updatedAt: string | null;
};

const DEFAULT_AUTH_SESSION: AuthSession = {
    isAuthenticated: false,
    accountId: null,
    email: null,
    provider: null,
    subscriptionTier: null,
    tokenBalance: null,
    profileHandle: null,
    profileName: null,
    accountRole: null,
    updatedAt: null,
};

export const getAuthSession = () => queryClient.getQueryData<AuthSession>(AUTH_SESSION_KEY) ?? DEFAULT_AUTH_SESSION;

export const setAuthSession = (session: Partial<AuthSession>) => {
    const nextSession: AuthSession = {
        ...getAuthSession(),
        ...session,
        isAuthenticated: session.isAuthenticated ?? true,
        updatedAt: new Date().toISOString(),
    };
    return queryClient.setQueryData(AUTH_SESSION_KEY, nextSession);
};

export const clearAuthSession = () => {
    return queryClient.setQueryData(AUTH_SESSION_KEY, { ...DEFAULT_AUTH_SESSION, updatedAt: new Date().toISOString() });
};

export const useAuthSession = () =>
    useQuery({
        queryKey: AUTH_SESSION_KEY,
        queryFn: () => getAuthSession(),
        staleTime: Infinity,
        gcTime: Infinity,
    });
