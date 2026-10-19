import { getDesktopEnvironmentSettings } from '@/environments/environment';
import { invoke, isTauri } from '@tauri-apps/api/core';

const readProblem = (body: unknown) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
    const problem = body as Record<string, unknown>;
    return {
        detail: typeof problem.detail === 'string' ? problem.detail : undefined,
        code: typeof problem.code === 'string' ? problem.code : undefined,
        traceId: typeof problem.traceId === 'string' ? problem.traceId : undefined,
    };
};

export class RestApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly problem: { detail?: string; code?: string; traceId?: string }
    ) {
        super(problem.detail ?? `Request failed (${status}).`);
        this.name = 'RestApiError';
    }
}

export const requestRest = async <T>(path: string, query: Record<string, string | number | null | undefined> = {}): Promise<T> => {
    const parameters: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') parameters[key] = String(value);
    }
    if (isTauri()) {
        // Native HTTP avoids browser CORS restrictions on tauri://localhost.
        const response = await invoke<{ status: number; body: unknown }>('desktop_get_robot_catalog', {
            path,
            query: parameters,
        });
        if (response.status < 200 || response.status >= 300) {
            throw new RestApiError(response.status, readProblem(response.body));
        }
        return response.body as T;
    }
    const settings = await getDesktopEnvironmentSettings();
    const url = new URL(`${settings.websiteApiUrl}/${path.replace(/^\/+/, '')}`);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store',
    });
    if (!response.ok) {
        const problem = await response.json().catch(() => ({ detail: response.statusText }));
        throw new RestApiError(response.status, readProblem(problem));
    }
    return response.json() as Promise<T>;
};
