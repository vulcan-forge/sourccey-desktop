'use client';

import { isTauri } from '@tauri-apps/api/core';
import { TauriEvent, listen } from '@tauri-apps/api/event';
import { WebviewWindow, getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { mutateStudioLogin, StudioLoginError } from '@/api/studio-login';
import { clearAuthSession, setAuthSession, useAuthSession, type AuthProvider } from '@/hooks/Auth/auth-session.hook';
import { useDesktopEnvironmentSettings } from '@/hooks/System/desktop-environment.hook';
import {
    DESKTOP_OAUTH_RESULT_EVENT,
    DESKTOP_OAUTH_WINDOW_LABEL_PREFIX,
    type DesktopOAuthResultPayload,
    type OAuthProvider,
} from '@/utils/auth/desktop-oauth';
import { toastErrorDefaults, toastInfoDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { useMutation } from '@tanstack/react-query';
import { Suspense, useEffect, useState } from 'react';
import { FaEye, FaEyeSlash, FaGithub, FaGoogle, FaSignOutAlt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useRef } from 'react';

const AUTH_PROVIDER_IDS = {
    credentials: 0,
} as const;

const VULCAN_WEBSITE_BASE_URL = 'https://vulcanrobotics.ai';
const VULCAN_API_BASE_URL = 'https://api.vulcanrobotics.ai';
const STAGING_VULCAN_WEBSITE_BASE_URL = 'https://staging.factory.vulcanrobotics.ai';
const STAGING_VULCAN_API_BASE_URL = 'https://api.staging.factory.vulcanrobotics.ai';

const loginToastErrorDefaults = {
    ...toastErrorDefaults,
    style: {
        ...toastErrorDefaults.style,
        maxWidth: '360px',
        padding: '10px 12px',
        fontSize: '13px',
        lineHeight: '1.35',
        whiteSpace: 'pre-wrap' as const,
        wordBreak: 'break-word' as const,
    },
};

const normalizeErrorMessage = (message: string) => {
    return message.replace(/\s+/g, ' ').trim();
};

const getAuthProviderLabel = (provider: AuthProvider | null) => {
    if (provider === 'google') {
        return 'Google';
    }
    if (provider === 'github') {
        return 'GitHub';
    }
    if (provider === 'credentials') {
        return 'Email & Password';
    }
    return 'Unknown';
};

const truncateErrorMessage = (message: string, maxLength = 160) => {
    if (message.length <= maxLength) {
        return message;
    }
    return `${message.slice(0, maxLength - 1).trimEnd()}...`;
};

const redactSensitiveValue = (value: string) => {
    if (!value) {
        return '***';
    }
    return '*'.repeat(Math.min(Math.max(value.length, 3), 12));
};

const sanitizeTextForLogging = (value: string) => {
    return value
        .replace(/("(?:password|token|secret|authorization|cookie)"\s*:\s*")([^"]*)(")/gi, (_match, start, secret, end) => {
            return `${start}${redactSensitiveValue(secret)}${end}`;
        })
        .replace(/((?:password|token|secret|authorization|cookie)\s*[=:]\s*)([^\s,;]+)/gi, (_match, prefix, secret) => {
            return `${prefix}${redactSensitiveValue(secret)}`;
        });
};

const sanitizeForLogging = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(sanitizeForLogging);
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, entryValue]) => {
            const normalizedKey = key.toLowerCase();
            if (
                normalizedKey.includes('password') ||
                normalizedKey.includes('token') ||
                normalizedKey.includes('secret') ||
                normalizedKey.includes('authorization') ||
                normalizedKey.includes('cookie')
            ) {
                if (typeof entryValue === 'string') {
                    return [key, redactSensitiveValue(entryValue)];
                }
                return [key, '***'];
            }

            return [key, sanitizeForLogging(entryValue)];
        })
    );
};

const getReadableOAuthError = (rawMessage: string | null, provider: OAuthProvider | null) => {
    const message = rawMessage ? truncateErrorMessage(normalizeErrorMessage(rawMessage)) : 'Social sign-in failed. Please try again.';
    if (!provider) {
        return message;
    }
    return `${getAuthProviderLabel(provider)} sign-in failed. ${message}`;
};

const resolveWebsiteBaseUrl = (environment: 'production' | 'staging' | 'local', studioWebUrl: string) => {
    if (environment === 'production') {
        return VULCAN_WEBSITE_BASE_URL;
    }
    if (environment === 'staging') {
        return STAGING_VULCAN_WEBSITE_BASE_URL;
    }
    return studioWebUrl;
};

const resolveDesktopOAuthBaseUrl = (environment: 'production' | 'staging' | 'local', graphqlApiUrl: string) => {
    if (environment === 'production') {
        return VULCAN_API_BASE_URL;
    }
    if (environment === 'staging') {
        return STAGING_VULCAN_API_BASE_URL;
    }
    return new URL(graphqlApiUrl).origin;
};

const buildWebsiteUrl = (baseUrl: string, path: string) => new URL(path, baseUrl).toString();

const buildDesktopOAuthCallbackUrl = () => {
    if (typeof window === 'undefined') {
        throw new Error('OAuth sign-in can only start in a browser context.');
    }

    const isLocalDevHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalDevHost && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        return new URL('/desktop/auth/callback', window.location.origin).toString();
    }

    return 'tauri://localhost/desktop/auth/callback';
};

const buildOAuthRedirectUrl = (oauthBaseUrl: string, provider: OAuthProvider, callbackUrl: string) => {
    const authorizationUrl = new URL(`/api/v1/auth/${provider}`, oauthBaseUrl);
    authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
    return authorizationUrl.toString();
};

const getOAuthWindowLabel = (provider: OAuthProvider) => `${DESKTOP_OAUTH_WINDOW_LABEL_PREFIX}-${provider}`;

const getCurrentTauriWindowLabel = () => {
    if (typeof window === 'undefined' || !isTauri()) {
        return null;
    }

    return getCurrentWebviewWindow().label;
};

const logLoginError = (error: unknown, friendlyMessage: string, request: Record<string, unknown>) => {
    if (error instanceof StudioLoginError) {
        console.error('[desktop-account] studio credentials login failed', {
            friendlyMessage,
            message: sanitizeTextForLogging(error.message),
            status: error.status,
            code: error.code,
            responseBody: sanitizeForLogging(error.responseBody),
            request: sanitizeForLogging(request),
        });
        return;
    }

    if (error instanceof Error) {
        console.error('[desktop-account] studio credentials login failed', {
            friendlyMessage,
            message: sanitizeTextForLogging(error.message),
            stack: error.stack,
            request: sanitizeForLogging(request),
        });
        return;
    }

    console.error('[desktop-account] studio credentials login failed', {
        friendlyMessage,
        error,
        request: sanitizeForLogging(request),
    });
};

const getReadableLoginError = (error: unknown) => {
    if (error instanceof StudioLoginError) {
        if (error.status === 404) {
            return 'Studio sign-in endpoint was not found. Check the configured Studio website URL and try again.';
        }
        if (error.status === 401) {
            return 'Studio rejected the desktop login request. Check the Studio auth proxy configuration and try again.';
        }

        const code = error.code?.toLowerCase();
        if (code === 'invalid_credentials') {
            return 'Invalid email or password.';
        }
        if (code === 'account_not_found') {
            return 'No Studio account exists for that email. Create one on the Studio website first.';
        }
        if (code === 'email_not_confirmed') {
            return 'Email not confirmed. Studio sent a fresh confirmation link.';
        }
        if (code === 'email_login_not_set_up') {
            return 'Email login is not set up for this account yet. Use "Forgot password?" on the Studio website first.';
        }
        if (code === 'relay_unreachable' || code === 'proxy_failed') {
            return 'Studio login is unavailable right now. Please try again in a moment.';
        }

        if (error.message) {
            return truncateErrorMessage(normalizeErrorMessage(error.message));
        }
    }

    if (error instanceof Error) {
        return truncateErrorMessage(normalizeErrorMessage(error.message));
    }

    return 'Login failed. Please try again.';
};

function AccountPageContent() {
    const { data: authSession } = useAuthSession();
    const { data: desktopEnvironmentSettings } = useDesktopEnvironmentSettings();

    const [email, setEmail] = useState(authSession?.email ?? '');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [oauthRedirectingProvider, setOauthRedirectingProvider] = useState<OAuthProvider | null>(null);
    const [tauriWindowLabel] = useState<string | null>(() => getCurrentTauriWindowLabel());
    const lastHandledOAuthPayloadRef = useRef<string | null>(null);

    const isAuthenticated = Boolean(authSession?.isAuthenticated && authSession?.accountId);
    const accountId = authSession?.accountId ?? null;
    const studioWebUrl = desktopEnvironmentSettings?.studioWebUrl ?? 'https://studio.vulcanrobotics.ai';
    const graphqlApiUrl = desktopEnvironmentSettings?.graphqlApiUrl ?? 'https://api.studio.vulcanrobotics.ai/v1/graphql';
    const desktopEnvironment = desktopEnvironmentSettings?.environment ?? 'production';
    const websiteBaseUrl = resolveWebsiteBaseUrl(desktopEnvironment, studioWebUrl);
    const desktopOAuthBaseUrl = resolveDesktopOAuthBaseUrl(desktopEnvironment, graphqlApiUrl);
    const activeProviderLabel = getAuthProviderLabel(authSession?.provider ?? null);
    const forgotPasswordUrl = buildWebsiteUrl(websiteBaseUrl, '/forgot-password?from=desktop');
    const createAccountUrl = buildWebsiteUrl(websiteBaseUrl, '/signup');
    const websiteLoginUrl = buildWebsiteUrl(websiteBaseUrl, '/login');
    const isOauthPopupWindow = Boolean(tauriWindowLabel?.startsWith(DESKTOP_OAUTH_WINDOW_LABEL_PREFIX));

    const handleOAuthResult = (payload: DesktopOAuthResultPayload) => {
        const payloadKey = JSON.stringify(payload);
        if (lastHandledOAuthPayloadRef.current === payloadKey) {
            return;
        }
        lastHandledOAuthPayloadRef.current = payloadKey;

        setOauthRedirectingProvider(null);

        if (payload.status === 'success' && payload.provider && payload.accountId && payload.email) {
            setEmail(payload.email);
            setPassword('');
            setAuthSession({
                isAuthenticated: true,
                accountId: payload.accountId,
                email: payload.email,
                provider: payload.provider,
                profileHandle: null,
                profileName: null,
                accountRole: null,
                subscriptionTier: null,
                tokenBalance: null,
            });
            toast.success(`Signed in with ${getAuthProviderLabel(payload.provider)}.`, { ...toastSuccessDefaults });
            return;
        }

        const friendlyMessage = getReadableOAuthError(payload.error, payload.provider);
        console.error('[desktop-account] studio social login failed', {
            friendlyMessage,
            provider: payload.provider,
            payload: sanitizeForLogging(payload),
        });
        toast.error(friendlyMessage, loginToastErrorDefaults);
    };

    useEffect(() => {
        if (!isTauri() || isOauthPopupWindow) {
            return;
        }

        let isDisposed = false;
        let unlisten: (() => void) | null = null;

        void listen<DesktopOAuthResultPayload>(DESKTOP_OAUTH_RESULT_EVENT, (event) => {
                if (isDisposed) {
                    return;
                }
                handleOAuthResult(event.payload);
            })
            .then((dispose) => {
                if (isDisposed) {
                    dispose();
                    return;
                }
                unlisten = dispose;
            });

        return () => {
            isDisposed = true;
            unlisten?.();
        };
    }, [isOauthPopupWindow]);

    const credentialsLogin = useMutation({
        mutationFn: async ({ email, password }: { email: string; password: string }) => {
            const loginPayload = await mutateStudioLogin({
                email,
                password,
                provider: AUTH_PROVIDER_IDS.credentials,
            });

            if (!loginPayload.account?.id) {
                throw new Error('Login succeeded but no account id was returned.');
            }

            return { loginPayload, email };
        },
        onSuccess: ({ loginPayload, email }) => {
            setAuthSession({
                isAuthenticated: true,
                accountId: loginPayload.account?.id ?? null,
                email: loginPayload.account?.email ?? email,
                provider: 'credentials',
                profileHandle: loginPayload.account?.profile?.handle ?? null,
                profileName: loginPayload.account?.profile?.name ?? null,
                accountRole: loginPayload.account?.role ?? null,
                subscriptionTier: null,
                tokenBalance: null,
            });
            setPassword('');
            toast.success('Signed in successfully.', { ...toastSuccessDefaults });
        },
        onError: (error, variables) => {
            const message = getReadableLoginError(error);
            logLoginError(error, message, variables);
            toast.error(message, loginToastErrorDefaults);
        },
    });
    const isSigningIn = credentialsLogin.isPending || oauthRedirectingProvider !== null;

    const handleCredentialsSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const normalizedEmail = email.trim();
        if (!normalizedEmail || !password) {
            toast.error('Enter both email and password.', { ...toastErrorDefaults });
            return;
        }
        credentialsLogin.mutate({ email: normalizedEmail, password });
    };

    const handleOAuthSignIn = (provider: OAuthProvider) => {
        try {
            setOauthRedirectingProvider(provider);
            const callbackUrl = buildDesktopOAuthCallbackUrl();
            const authorizationUrl = buildOAuthRedirectUrl(desktopOAuthBaseUrl, provider, callbackUrl);

            if (!isTauri()) {
                window.location.assign(authorizationUrl);
                return;
            }

            void (async () => {
                const windowLabel = getOAuthWindowLabel(provider);
                const existingWindow = await WebviewWindow.getByLabel(windowLabel);
                await existingWindow?.close();

                const authWindow = new WebviewWindow(windowLabel, {
                    url: authorizationUrl,
                    title: provider === 'google' ? 'Continue with Google' : 'Continue with GitHub',
                    width: 540,
                    height: 760,
                    minWidth: 460,
                    minHeight: 680,
                    center: true,
                    focus: true,
                    resizable: true,
                    maximizable: false,
                    minimizable: false,
                    parent: getCurrentWebviewWindow(),
                });

                void authWindow.once(TauriEvent.WINDOW_DESTROYED, () => {
                    setOauthRedirectingProvider((current) => (current === provider ? null : current));
                });

                void authWindow.once('tauri://error', (event) => {
                    setOauthRedirectingProvider(null);
                    console.error('[desktop-account] failed to create desktop social auth window', {
                        provider,
                        error: event.payload,
                    });
                    toast.error('Unable to open the social sign-in window. Please try again.', loginToastErrorDefaults);
                });
            })().catch((error) => {
                setOauthRedirectingProvider(null);
                const message =
                    error instanceof Error
                        ? truncateErrorMessage(normalizeErrorMessage(error.message))
                        : 'Unable to start social sign-in.';

                console.error('[desktop-account] failed to start studio social login', {
                    provider,
                    message,
                });
                toast.error(message, loginToastErrorDefaults);
            });
        } catch (error) {
            setOauthRedirectingProvider(null);
            const message =
                error instanceof Error
                    ? truncateErrorMessage(normalizeErrorMessage(error.message))
                    : 'Unable to start social sign-in.';

            console.error('[desktop-account] failed to start studio social login', {
                provider,
                message,
            });
            toast.error(message, loginToastErrorDefaults);
        }
    };

    const handleSignOut = () => {
        clearAuthSession();
        setPassword('');
        toast.info('Signed out from the local desktop session.', { ...toastInfoDefaults });
    };

    const handleOpenStudio = () => {
        void openUrl(studioWebUrl);
    };

    const handleOpenWebsiteUrl = (url: string) => {
        void openUrl(url);
    };

    return (
        <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900">
            <div className="container mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
                {!isAuthenticated ? (
                    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full items-center justify-center">
                        <div className="w-full max-w-md rounded-2xl border border-slate-500/60 bg-slate-800/75 p-8 text-slate-100 shadow-2xl shadow-slate-900/40 backdrop-blur">
                            <div className="mb-8 space-y-2">
                                <h1 className="text-3xl font-semibold text-white">Welcome back</h1>
                                <p className="text-sm text-slate-300/80">
                                    Sign in with email or continue with Google or GitHub.
                                </p>
                            </div>

                            <form className="space-y-4" onSubmit={handleCredentialsSubmit}>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold tracking-widest text-slate-300 uppercase">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        placeholder="Email"
                                        autoComplete="email"
                                        className="w-full rounded-xl border border-slate-600/60 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 transition outline-none placeholder:text-slate-500 focus:border-amber-300"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold tracking-widest text-slate-300 uppercase">Password</label>
                                    <div className="group relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(event) => setPassword(event.target.value)}
                                            placeholder="********"
                                            autoComplete="current-password"
                                            className="auth-password-input w-full rounded-xl border border-slate-600/60 bg-slate-900/60 px-4 py-3 pr-12 text-sm text-slate-100 transition outline-none placeholder:text-slate-500 focus:border-amber-300 [color-scheme:dark]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((value) => !value)}
                                            className="absolute top-1/2 right-4 -translate-y-1/2 cursor-pointer text-slate-400 transition hover:text-slate-200"
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                            title={showPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSigningIn}
                                    className="w-full cursor-pointer rounded-xl bg-linear-to-r from-amber-300 via-orange-300 to-amber-400 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-amber-500/20 transition hover:from-amber-200 hover:via-orange-200 hover:to-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {credentialsLogin.isPending ? 'Signing in...' : 'Sign in'}
                                </button>
                            </form>

                            <div className="my-6 flex items-center gap-3 text-xs tracking-widest text-slate-400 uppercase">
                                <span className="h-px flex-1 bg-slate-600/60" />
                                or
                                <span className="h-px flex-1 bg-slate-600/60" />
                            </div>

                            <div className="grid gap-3">
                                <button
                                    type="button"
                                    disabled={isSigningIn}
                                    onClick={() => handleOAuthSignIn('google')}
                                    className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-slate-600/60 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <FaGoogle className="text-base" />
                                    {oauthRedirectingProvider === 'google' ? 'Redirecting...' : 'Continue with Google'}
                                </button>
                                <button
                                    type="button"
                                    disabled={isSigningIn}
                                    onClick={() => handleOAuthSignIn('github')}
                                    className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-slate-600/60 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <FaGithub className="text-base" />
                                    {oauthRedirectingProvider === 'github' ? 'Redirecting...' : 'Continue with GitHub'}
                                </button>
                            </div>

                            <div className="mt-6 flex items-center justify-between gap-4 text-xs text-slate-400">
                                <button
                                    type="button"
                                    onClick={() => handleOpenWebsiteUrl(forgotPasswordUrl)}
                                    className="cursor-pointer text-amber-300 transition hover:text-amber-200"
                                >
                                    Forgot password?
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleOpenWebsiteUrl(createAccountUrl)}
                                    className="cursor-pointer text-amber-300 transition hover:text-amber-200"
                                >
                                    Create an account
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-500/60 bg-slate-800/75 p-8 text-slate-100 shadow-2xl shadow-slate-900/40 backdrop-blur">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="space-y-2">
                                <h1 className="text-3xl font-semibold text-white">Account</h1>
                                <p className="text-sm text-slate-300/80">Signed in through the Vulcan website account system.</p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={() => handleOpenWebsiteUrl(websiteLoginUrl)}
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-600/60 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-amber-300"
                                >
                                    Open Website
                                </button>
                                <button
                                    type="button"
                                    onClick={handleOpenStudio}
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-600/60 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-amber-300"
                                >
                                    Open Studio
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSignOut}
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-600/60 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-amber-300"
                                >
                                    <FaSignOutAlt className="h-4 w-4" />
                                    Sign Out
                                </button>
                            </div>
                        </div>

                        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-4 text-sm text-slate-200">
                                <div className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Provider</div>
                                <div>{activeProviderLabel}</div>
                            </div>
                            <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-4 text-sm text-slate-200">
                                <div className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Account ID</div>
                                <div className="truncate">{accountId ?? 'Not available'}</div>
                            </div>
                            <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-4 text-sm text-slate-200">
                                <div className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Email</div>
                                <div className="truncate">{authSession?.email ?? 'Not available'}</div>
                            </div>
                            <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-4 text-sm text-slate-200">
                                <div className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Role</div>
                                <div>{authSession?.accountRole ?? 'Not available'}</div>
                            </div>
                            <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-4 text-sm text-slate-200">
                                <div className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Profile Name</div>
                                <div>{authSession?.profileName ?? 'Not available'}</div>
                            </div>
                            <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-4 text-sm text-slate-200">
                                <div className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Handle</div>
                                <div>{authSession?.profileHandle ?? 'Not available'}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const AccountPageFallback = () => (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="container mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
            <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-500/60 bg-slate-800/75 p-8 shadow-2xl shadow-slate-900/40 backdrop-blur">
                <div className="h-8 w-48 animate-pulse rounded bg-slate-700" />
                <div className="mt-3 h-4 w-72 animate-pulse rounded bg-slate-800" />
            </div>
        </div>
    </div>
);

export default function AccountPage() {
    return (
        <Suspense fallback={<AccountPageFallback />}>
            <AccountPageContent />
        </Suspense>
    );
}
