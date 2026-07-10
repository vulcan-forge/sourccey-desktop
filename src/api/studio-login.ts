import { getDesktopEnvironmentSettings } from '@/environments/environment';
import { invoke, isTauri } from '@tauri-apps/api/core';

export type StudioLoginRequest = {
    email: string;
    password: string;
    provider: number;
    intent?: string | null;
};

type StudioLoginProxyResponse = {
    status: number;
    body: unknown;
};

type StudioLoginPayloadRaw = {
    account?: {
        id?: string | null;
        email?: string | null;
        email_id?: string | null;
        google_id?: string | null;
        github_id?: string | null;
        session_version?: string | null;
        role?: string | null;
        is_email_login_confirmed?: boolean | null;
        profile?: {
            name?: string | null;
            handle?: string | null;
            image?: string | null;
        } | null;
    } | null;
    created?: boolean | null;
    error?: {
        message?: string | null;
        code?: string | null;
        link?: string | null;
    } | null;
};

export type StudioLoginPayload = {
    account: {
        id: string | null;
        email: string | null;
        emailId: string | null;
        googleId: string | null;
        githubId: string | null;
        sessionVersion: string | null;
        role: string | null;
        isEmailLoginConfirmed: boolean;
        profile: {
            name: string | null;
            handle: string | null;
            image: string | null;
        } | null;
    } | null;
    created: boolean;
    error: {
        message: string | null;
        code: string | null;
        link: string | null;
    } | null;
};

export class StudioLoginError extends Error {
    status: number | null;
    code: string | null;
    responseBody: unknown;

    constructor(
        message: string,
        options: {
            status?: number | null;
            code?: string | null;
            responseBody?: unknown;
        } = {}
    ) {
        super(message);
        this.name = 'StudioLoginError';
        this.status = options.status ?? null;
        this.code = options.code ?? null;
        this.responseBody = options.responseBody;
    }
}

const asObject = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
};

const readString = (value: unknown) => {
    return typeof value === 'string' ? value : null;
};

const readBoolean = (value: unknown) => {
    return typeof value === 'boolean' ? value : false;
};

const normalizeStudioLoginPayload = (value: unknown): StudioLoginPayload => {
    const raw = asObject(value) as StudioLoginPayloadRaw | null;
    const rawAccount = asObject(raw?.account);
    const rawProfile = asObject(rawAccount?.profile);
    const rawError = asObject(raw?.error);

    return {
        account: rawAccount
            ? {
                  id: readString(rawAccount.id),
                  email: readString(rawAccount.email),
                  emailId: readString(rawAccount.email_id),
                  googleId: readString(rawAccount.google_id),
                  githubId: readString(rawAccount.github_id),
                  sessionVersion: readString(rawAccount.session_version),
                  role: readString(rawAccount.role),
                  isEmailLoginConfirmed: readBoolean(rawAccount.is_email_login_confirmed),
                  profile: rawProfile
                      ? {
                            name: readString(rawProfile.name),
                            handle: readString(rawProfile.handle),
                            image: readString(rawProfile.image),
                        }
                      : null,
              }
            : null,
        created: readBoolean(raw?.created),
        error: rawError
            ? {
                  message: readString(rawError.message),
                  code: readString(rawError.code),
                  link: readString(rawError.link),
              }
            : null,
    };
};

const ensureSuccessfulLogin = (status: number, body: unknown): StudioLoginPayload => {
    const payload = normalizeStudioLoginPayload(body);
    if (status >= 400 || payload.error?.message) {
        throw new StudioLoginError(
            payload.error?.message ?? `Studio login failed with status ${status}.`,
            {
                status,
                code: payload.error?.code ?? null,
                responseBody: body,
            }
        );
    }
    return payload;
};

const buildStudioLoginUrl = async () => {
    const settings = await getDesktopEnvironmentSettings();
    return `${settings.studioWebUrl}/api/relay-auth/login`;
};

const loginViaFetch = async (request: StudioLoginRequest) => {
    const url = await buildStudioLoginUrl();

    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(request),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to reach the Studio login service.';
        throw new StudioLoginError(message, { responseBody: error });
    }

    let body: unknown = null;
    try {
        body = await response.json();
    } catch {
        throw new StudioLoginError(
            `Studio login returned an invalid response (${response.status}).`,
            { status: response.status }
        );
    }

    return ensureSuccessfulLogin(response.status, body);
};

const loginViaTauri = async (request: StudioLoginRequest) => {
    const response = await invoke<StudioLoginProxyResponse>('desktop_login_via_studio', { request });
    if (!response || typeof response.status !== 'number') {
        throw new StudioLoginError('Desktop login returned an invalid response.');
    }

    return ensureSuccessfulLogin(response.status, response.body);
};

export const mutateStudioLogin = async (request: StudioLoginRequest) => {
    if (isTauri()) {
        return loginViaTauri(request);
    }

    return loginViaFetch(request);
};
