'use client';

import { mutateStudioLogin, StudioLoginError } from '@/api/studio-login';
import { clearAuthSession, setAuthSession, useAuthSession } from '@/hooks/Auth/auth-session.hook';
import { useDesktopEnvironmentSettings } from '@/hooks/System/desktop-environment.hook';
import { toastErrorDefaults, toastInfoDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { useMutation } from '@tanstack/react-query';
import { Suspense, useState } from 'react';
import { FaEye, FaEyeSlash, FaSignOutAlt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { openUrl } from '@tauri-apps/plugin-opener';

const AUTH_PROVIDER_IDS = {
    credentials: 0,
} as const;

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

    const isAuthenticated = Boolean(authSession?.isAuthenticated && authSession?.accountId);
    const accountId = authSession?.accountId ?? null;
    const studioWebUrl = desktopEnvironmentSettings?.studioWebUrl ?? 'https://studio.vulcanrobotics.ai';

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

    const handleCredentialsSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const normalizedEmail = email.trim();
        if (!normalizedEmail || !password) {
            toast.error('Enter both email and password.', { ...toastErrorDefaults });
            return;
        }
        credentialsLogin.mutate({ email: normalizedEmail, password });
    };

    const handleSignOut = () => {
        clearAuthSession();
        setPassword('');
        toast.info('Signed out from the local desktop session.', { ...toastInfoDefaults });
    };

    const handleOpenStudio = () => {
        void openUrl(studioWebUrl);
    };

    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto flex max-w-5xl flex-col gap-8 px-8 py-10">
                {!isAuthenticated ? (
                    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-7 shadow-2xl">
                        <h1 className="text-2xl font-semibold text-white">Sign in to Vulcan Studio</h1>
                        <p className="mt-2 text-sm text-slate-300">Use the same email and password you use on the Studio website.</p>

                        <form onSubmit={handleCredentialsSubmit} className="mt-6 flex flex-col gap-3">
                            <input
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="Email"
                                autoComplete="email"
                                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 transition outline-none placeholder:text-slate-400 focus:border-orange-300"
                            />
                            <div className="group relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="Password"
                                    autoComplete="current-password"
                                    className="auth-password-input w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 pr-10 text-sm text-slate-100 transition outline-none placeholder:text-slate-400 focus:border-orange-300 [color-scheme:dark]"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((value) => !value)}
                                    className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-slate-200 opacity-0 transition hover:text-white group-focus-within:opacity-100"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    title={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                                </button>
                            </div>
                            <button
                                type="submit"
                                disabled={credentialsLogin.isPending}
                                className="mt-1 inline-flex cursor-pointer items-center justify-center rounded-lg bg-gradient-to-r from-red-400/70 via-orange-400/70 to-yellow-400/70 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:from-red-500/70 hover:via-orange-500/70 hover:to-yellow-500/70 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {credentialsLogin.isPending ? 'Signing In...' : 'Sign In'}
                            </button>
                        </form>

                        <div className="mt-5 rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-xs text-slate-300">
                            If you need to create an account, confirm your email, or reset your password, use{' '}
                            <button
                                type="button"
                                onClick={handleOpenStudio}
                                className="cursor-pointer text-orange-300 hover:text-orange-200"
                            >
                                {studioWebUrl}
                            </button>
                            .
                        </div>
                    </div>
                ) : (
                    <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-xl">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h1 className="text-2xl font-semibold text-white">Account</h1>
                                <p className="mt-2 text-sm text-slate-300">Signed in through the Studio login system.</p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={handleOpenStudio}
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-orange-300 hover:bg-orange-400/10"
                                >
                                    Open Studio
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSignOut}
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-orange-300 hover:bg-orange-400/10"
                                >
                                    <FaSignOutAlt className="h-4 w-4" />
                                    Sign Out
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3 text-sm text-slate-200">
                                <div className="text-slate-400">Provider</div>
                                <div>Email &amp; Password</div>
                            </div>
                            <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3 text-sm text-slate-200">
                                <div className="text-slate-400">Account ID</div>
                                <div className="truncate">{accountId ?? 'Not available'}</div>
                            </div>
                            <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3 text-sm text-slate-200">
                                <div className="text-slate-400">Email</div>
                                <div className="truncate">{authSession?.email ?? 'Not available'}</div>
                            </div>
                            <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3 text-sm text-slate-200">
                                <div className="text-slate-400">Role</div>
                                <div>{authSession?.accountRole ?? 'Not available'}</div>
                            </div>
                            <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3 text-sm text-slate-200">
                                <div className="text-slate-400">Profile Name</div>
                                <div>{authSession?.profileName ?? 'Not available'}</div>
                            </div>
                            <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3 text-sm text-slate-200">
                                <div className="text-slate-400">Handle</div>
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
    <div className="min-h-screen bg-slate-900/30">
        <div className="container mx-auto flex max-w-5xl flex-col gap-8 px-8 py-10">
            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-7 shadow-2xl">
                <div className="h-6 w-56 animate-pulse rounded bg-slate-700" />
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
