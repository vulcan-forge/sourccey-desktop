'use client';

import { mutateLogin } from '@/api/GraphQL/Account/Mutations/LoginMutation';
import { queryProfile } from '@/api/GraphQL/Profile/Query';
import { queryAccountSummary } from '@/api/Account/account-summary';
import { clearAuthSession, setAuthSession, useAuthSession, type AuthProvider } from '@/hooks/Auth/auth-session.hook';
import { toastErrorDefaults, toastInfoDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { getReCaptchaSiteKey, getReCaptchaToken } from '@/utils/recaptcha';
import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { FaEye, FaEyeSlash, FaGithub, FaGoogle, FaSignOutAlt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { ClientError } from 'graphql-request';
import { openUrl } from '@tauri-apps/plugin-opener';

const AUTH_PROVIDER_IDS = {
    credentials: 0,
    google: 1,
    github: 2,
} as const;
type OAuthProvider = 'google' | 'github';

const readFirstValue = (params: URLSearchParams, keys: string[]) => {
    for (const key of keys) {
        const value = params.get(key);
        if (value) return value;
    }
    return null;
};

const parseTokenBalance = (value: string | null) => {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeProvider = (provider: string | null): AuthProvider => {
    const normalized = provider?.toLowerCase() ?? '';
    if (normalized === 'google') return 'google';
    if (normalized === 'github') return 'github';
    if (normalized === 'credentials') return 'credentials';
    return 'unknown';
};

const isOAuthSuccess = (params: URLSearchParams) => {
    const status = readFirstValue(params, ['status', 'auth_status', 'auth', 'result'])?.toLowerCase();
    const hasAccountSignal = Boolean(readFirstValue(params, ['accountId', 'account_id', 'id']));
    if (!status) return hasAccountSignal;
    return status === 'ok' || status === 'success' || status === 'authenticated' || status === 'signed_in';
};

const buildOAuthUrl = (template: string) => {
    const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/desktop/account` : '/desktop/account';
    if (template.includes('{redirect_uri}')) {
        return template.replace('{redirect_uri}', encodeURIComponent(redirectUri));
    }

    const separator = template.includes('?') ? '&' : '?';
    return `${template}${separator}redirect_uri=${encodeURIComponent(redirectUri)}`;
};

const getOAuthUrlCandidates = (oauthUrl: string) => {
    const candidates = [oauthUrl];
    try {
        const parsed = new URL(oauthUrl);
        const variants = [
            parsed.pathname.replace(/^\/api\/v1\/auth\//, '/v1/auth/'),
            parsed.pathname.replace(/^\/v1\/auth\//, '/api/v1/auth/'),
        ];

        for (const pathname of variants) {
            if (pathname === parsed.pathname) continue;
            const variantUrl = new URL(oauthUrl);
            variantUrl.pathname = pathname;
            candidates.push(variantUrl.toString());
        }
    } catch {
        // Keep original URL only.
    }
    return Array.from(new Set(candidates));
};

const probeOAuthEndpoint = async (oauthUrl: string): Promise<'reachable' | 'not_found' | 'unknown'> => {
    try {
        const response = await fetch(oauthUrl, {
            method: 'HEAD',
            redirect: 'manual',
            credentials: 'include',
        });
        if (response.status === 404) return 'not_found';
        return 'reachable';
    } catch {
        return 'unknown';
    }
};

const getReadableGraphQLError = (error: unknown) => {
    if (error instanceof ClientError) {
        const firstError = error.response?.errors?.[0];
        if (firstError?.message) return firstError.message;
    }
    if (error instanceof Error) return error.message;
    return 'Login failed.';
};

function AccountPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: authSession } = useAuthSession();

    const [email, setEmail] = useState(authSession?.email ?? '');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [oauthPendingProvider, setOauthPendingProvider] = useState<OAuthProvider | null>(null);

    const isAuthenticated = Boolean(authSession?.isAuthenticated && authSession?.accountId);
    const accountId = authSession?.accountId ?? null;
    const googleLoginUrl = process.env.NEXT_PUBLIC_AUTH_GOOGLE_URL;
    const githubLoginUrl = process.env.NEXT_PUBLIC_AUTH_GITHUB_URL;
    const hasSummaryEndpoint = Boolean(process.env.NEXT_PUBLIC_ACCOUNT_SUMMARY_URL);

    const providerLabel = useMemo(() => {
        if (!authSession?.provider) return 'Not set';
        return authSession.provider.charAt(0).toUpperCase() + authSession.provider.slice(1);
    }, [authSession?.provider]);

    const refreshProfileAndEntitlements = useMutation({
        mutationFn: async () => {
            if (!authSession?.isAuthenticated || !authSession?.accountId) {
                throw new Error('Sign in first to refresh account details.');
            }

            const profile = authSession.email ? await queryProfile(null, null, authSession.email).catch(() => null) : null;
            const summary = await queryAccountSummary(authSession.accountId);
            return { profile, summary };
        },
        onSuccess: ({ profile, summary }) => {
            setAuthSession({
                profileHandle: profile?.handle ?? authSession?.profileHandle ?? null,
                profileName: profile?.name ?? authSession?.profileName ?? null,
                accountRole: profile?.account?.role ?? authSession?.accountRole ?? null,
            });

            if (!summary) {
                toast.info('Account summary endpoint not configured yet. Set NEXT_PUBLIC_ACCOUNT_SUMMARY_URL to enable it.', {
                    ...toastInfoDefaults,
                });
                return;
            }

            setAuthSession({
                subscriptionTier: summary.subscriptionTier,
                tokenBalance: summary.tokenBalance,
            });
            toast.success('Account summary refreshed.', { ...toastSuccessDefaults });
        },
        onError: (error) => {
            const message = error instanceof Error ? error.message : 'Failed to refresh account details.';
            toast.error(message, { ...toastErrorDefaults });
        },
    });

    const credentialsLogin = useMutation({
        mutationFn: async ({ email, password }: { email: string; password: string }) => {
            const recaptchaEnabled = Boolean(getReCaptchaSiteKey());
            const recaptcha = recaptchaEnabled ? await getReCaptchaToken('login') : null;
            if (recaptchaEnabled && !recaptcha) {
                throw new Error('reCAPTCHA validation failed. Please try again.');
            }

            const loginPayload = await mutateLogin({
                email,
                password,
                provider: AUTH_PROVIDER_IDS.credentials,
                recaptcha: recaptcha ?? undefined,
            });

            if (loginPayload?.error?.message) {
                throw new Error(loginPayload.error.message);
            }
            if (!loginPayload?.account?.id) {
                throw new Error('Login succeeded but no account id was returned.');
            }

            const profile = await queryProfile(null, null, email).catch(() => null);
            const summary = await queryAccountSummary(loginPayload.account.id).catch(() => null);
            return { loginPayload, profile, summary, email };
        },
        onSuccess: ({ loginPayload, profile, summary, email }) => {
            setAuthSession({
                isAuthenticated: true,
                accountId: loginPayload.account.id,
                email,
                provider: 'credentials',
                profileHandle: profile?.handle ?? null,
                profileName: profile?.name ?? null,
                accountRole: profile?.account?.role ?? null,
                subscriptionTier: summary?.subscriptionTier ?? null,
                tokenBalance: summary?.tokenBalance ?? null,
            });
            setPassword('');
            toast.success('Signed in successfully.', { ...toastSuccessDefaults });
        },
        onError: (error) => {
            const message = getReadableGraphQLError(error);
            toast.error(message, { ...toastErrorDefaults });
        },
    });

    useEffect(() => {
        if (!searchParams.size) return;
        const currentParams = new URLSearchParams(searchParams.toString());
        if (!isOAuthSuccess(currentParams)) {
            const callbackError = readFirstValue(currentParams, ['error', 'message']);
            if (callbackError) {
                toast.error(callbackError, { ...toastErrorDefaults });
                router.replace('/desktop/account');
            }
            return;
        }

        const accountIdFromCallback = readFirstValue(currentParams, ['accountId', 'account_id', 'id']);
        const emailFromCallback = readFirstValue(currentParams, ['email', 'account_email']);
        if (!accountIdFromCallback) return;

        setAuthSession({
            isAuthenticated: true,
            accountId: accountIdFromCallback,
            email: emailFromCallback,
            provider: normalizeProvider(readFirstValue(currentParams, ['provider'])),
            subscriptionTier: readFirstValue(currentParams, ['subscriptionTier', 'subscription_tier', 'subscription', 'plan', 'tier']),
            tokenBalance: parseTokenBalance(readFirstValue(currentParams, ['tokenBalance', 'token_balance', 'tokens', 'tokens_available'])),
        });
        toast.success('OAuth sign-in complete.', { ...toastSuccessDefaults });
        router.replace('/desktop/account');
    }, [router, searchParams]);

    const handleCredentialsSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const normalizedEmail = email.trim();
        if (!normalizedEmail || !password) {
            toast.error('Enter both email and password.', { ...toastErrorDefaults });
            return;
        }
        credentialsLogin.mutate({ email: normalizedEmail, password });
    };

    const beginOAuth = async (provider: OAuthProvider) => {
        if (oauthPendingProvider) return;
        const endpoint = provider === 'google' ? googleLoginUrl : githubLoginUrl;
        if (!endpoint) {
            toast.error(`Set NEXT_PUBLIC_AUTH_${provider.toUpperCase()}_URL in your env file before using ${provider} login.`, {
                ...toastErrorDefaults,
            });
            return;
        }

        setOauthPendingProvider(provider);

        const oauthUrl = buildOAuthUrl(endpoint);
        const candidates = getOAuthUrlCandidates(oauthUrl);

        let hadUnknownProbe = false;
        for (const candidate of candidates) {
            const status = await probeOAuthEndpoint(candidate);
            if (status === 'reachable') {
                window.location.assign(candidate);
                return;
            }
            if (status === 'unknown') {
                hadUnknownProbe = true;
            }
        }

        if (hadUnknownProbe) {
            window.location.assign(oauthUrl);
            return;
        }

        toast.error(
            `Could not find a working ${provider} auth endpoint. Checked: ${candidates.join(' , ')}`,
            { ...toastErrorDefaults }
        );
        setOauthPendingProvider(null);
    };

    const handleSignOut = () => {
        clearAuthSession();
        setPassword('');
        toast.info('Signed out from the local desktop session.', { ...toastInfoDefaults });
    };

    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto flex max-w-5xl flex-col gap-8 px-8 py-10">
                {!isAuthenticated ? (
                    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-7 shadow-2xl">
                        <h1 className="text-2xl font-semibold text-white">Sign in to Vulcan Studio</h1>
                        <p className="mt-2 text-sm text-slate-300">Email and password or continue with a provider.</p>

                        <form onSubmit={handleCredentialsSubmit} className="mt-6 flex flex-col gap-3">
                            <input
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="name@sourccey.com"
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

                        <div className="my-5 flex items-center gap-3">
                            <div className="h-px flex-1 bg-slate-700" />
                            <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">Or continue with</span>
                            <div className="h-px flex-1 bg-slate-700" />
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                type="button"
                                onClick={() => beginOAuth('google')}
                                disabled={oauthPendingProvider !== null}
                                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-orange-300 hover:bg-orange-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <FaGoogle className="h-4 w-4" />
                                {oauthPendingProvider === 'google' ? 'Opening Google...' : 'Continue with Google'}
                            </button>
                            <button
                                type="button"
                                onClick={() => beginOAuth('github')}
                                disabled={oauthPendingProvider !== null}
                                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-orange-300 hover:bg-orange-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <FaGithub className="h-4 w-4" />
                                {oauthPendingProvider === 'github' ? 'Opening GitHub...' : 'Continue with GitHub'}
                            </button>
                        </div>

                        <p className="mt-5 text-center text-xs text-slate-400">
                            Use the same account you use to log in at{' '}
                            <button
                                type="button"
                                onClick={() => {
                                    void openUrl('https://sourccey.com');
                                }}
                                className="cursor-pointer text-orange-300 hover:text-orange-200"
                            >
                                sourccey.com
                            </button>
                            .
                        </p>
                    </div>
                ) : (
                    <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-xl">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h1 className="text-2xl font-semibold text-white">Account</h1>
                                <p className="mt-2 text-sm text-slate-300">Signed in and ready to map entitlements.</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleSignOut}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-orange-300 hover:bg-orange-400/10"
                            >
                                <FaSignOutAlt className="h-4 w-4" />
                                Sign Out
                            </button>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3 text-sm text-slate-200">
                                <div className="text-slate-400">Provider</div>
                                <div>{providerLabel}</div>
                            </div>
                            <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3 text-sm text-slate-200">
                                <div className="text-slate-400">Account ID</div>
                                <div className="truncate">{accountId ?? 'Not available'}</div>
                            </div>
                            <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3 text-sm text-slate-200">
                                <div className="text-slate-400">Subscription</div>
                                <div>{authSession?.subscriptionTier ?? 'Pending backend response'}</div>
                            </div>
                            <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3 text-sm text-slate-200">
                                <div className="text-slate-400">Tokens Available</div>
                                <div>
                                    {authSession?.tokenBalance != null ? authSession.tokenBalance.toLocaleString() : 'Pending backend response'}
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                            <button
                                type="button"
                                disabled={refreshProfileAndEntitlements.isPending || !hasSummaryEndpoint}
                                onClick={() => refreshProfileAndEntitlements.mutate()}
                                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-orange-300 hover:bg-orange-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {refreshProfileAndEntitlements.isPending ? 'Refreshing...' : 'Refresh Subscription & Tokens'}
                            </button>
                            {!hasSummaryEndpoint && (
                                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                                    Set `NEXT_PUBLIC_ACCOUNT_SUMMARY_URL` to enable entitlement refresh.
                                </div>
                            )}
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
