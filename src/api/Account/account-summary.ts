export type AccountSummary = {
    subscriptionTier: string | null;
    tokenBalance: number | null;
    payload: any;
};

const parseNumber = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const parseString = (value: unknown) => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
};

const getSubscriptionTier = (payload: any) => {
    const candidates = [
        payload?.subscriptionTier,
        payload?.subscription?.tier,
        payload?.subscription?.name,
        payload?.plan,
        payload?.tier,
    ];
    for (const candidate of candidates) {
        const tier = parseString(candidate);
        if (tier) return tier;
    }
    return null;
};

const getTokenBalance = (payload: any) => {
    const candidates = [
        payload?.tokenBalance,
        payload?.tokens,
        payload?.tokensAvailable,
        payload?.subscription?.tokensAvailable,
        payload?.usage?.tokensAvailable,
        payload?.creditsRemaining,
    ];
    for (const candidate of candidates) {
        const tokenBalance = parseNumber(candidate);
        if (tokenBalance != null) return tokenBalance;
    }
    return null;
};

export const queryAccountSummary = async (accountId: string) => {
    const endpoint = process.env.NEXT_PUBLIC_ACCOUNT_SUMMARY_URL;
    if (!endpoint || !accountId) return null;

    const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    url.searchParams.set('accountId', accountId);

    const response = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error(`Failed to load account summary (status ${response.status})`);
    }

    const payload = await response.json();
    return {
        subscriptionTier: getSubscriptionTier(payload),
        tokenBalance: getTokenBalance(payload),
        payload,
    } as AccountSummary;
};
