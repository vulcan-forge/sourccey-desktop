export const DESKTOP_OAUTH_RESULT_EVENT = 'desktop-oauth-result';
export const DESKTOP_OAUTH_WINDOW_LABEL_PREFIX = 'desktop-oauth';

export const OAUTH_PROVIDERS = {
    google: 'google',
    github: 'github',
} as const;

export type OAuthProvider = keyof typeof OAUTH_PROVIDERS;
export type DesktopOAuthStatus = 'success' | 'error';
export type DesktopOAuthResultPayload = {
    status: DesktopOAuthStatus;
    provider: OAuthProvider | null;
    accountId: string | null;
    email: string | null;
    error: string | null;
};

export const normalizeOAuthProvider = (value: string | null): OAuthProvider | null => {
    if (value === OAUTH_PROVIDERS.google || value === OAUTH_PROVIDERS.github) {
        return value;
    }

    return null;
};
