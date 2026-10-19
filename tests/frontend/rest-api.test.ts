// @ts-nocheck
import { afterEach, describe, expect, it } from 'bun:test';
import { requestRest, RestApiError } from '../../src/api/Api';
import { queryRobot, queryRobots } from '../../src/api/Rest/Robot';
import { mutateStudioLogin, StudioLoginError } from '../../src/api/studio-login';
import { buildDesktopEnvironmentSettingsFromProcessEnv, setDesktopEnvironmentSettings } from '../../src/environments/environment';
import { buildOAuthRedirectUrl } from '../../src/utils/auth/desktop-oauth';

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
    setDesktopEnvironmentSettings(buildDesktopEnvironmentSettingsFromProcessEnv({}));
});

describe('desktop REST integration', () => {
    it('uses the website catalog and preserves opaque pagination and search values', async () => {
        setDesktopEnvironmentSettings(buildDesktopEnvironmentSettingsFromProcessEnv({ NEXT_PUBLIC_ENVIRONMENT: 'staging' }));
        const page = { items: [{ id: 'robot-1' }], totalCount: 2, nextCursor: 'opaque+/=', previousCursor: null };
        const requests: URL[] = [];
        globalThis.fetch = (async (input, init) => {
            requests.push(new URL(String(input)));
            expect(init?.credentials).toBe('include');
            expect(init?.cache).toBe('no-store');
            return Response.json(page);
        }) as typeof fetch;
        const params = { limit: 10, cursor: 'opaque+/=', sort: '-name,id', search: 'robot "one" & two' };
        expect(await queryRobots(params)).toEqual(page);
        expect(params.cursor).toBe('opaque+/=');
        expect(requests[0]?.origin).toBe('https://api.staging.factory.vulcanrobotics.ai');
        expect(requests[0]?.pathname).toBe('/v1/robots');
        expect(requests[0]?.searchParams.get('cursor')).toBe(params.cursor);
        expect(requests[0]?.searchParams.get('search')).toBe(params.search);
        await queryRobot({ name: 'robot & one' });
        expect(requests[1]?.pathname).toBe('/v1/robots/lookup');
        expect(requests[1]?.searchParams.get('name')).toBe('robot & one');
    });

    it('reports ProblemDetails from resource requests', async () => {
        globalThis.fetch = (async () => Response.json({ detail: 'Invalid cursor.', code: 'invalid_cursor' }, { status: 400 })) as typeof fetch;
        try {
            await requestRest('robots');
            throw new Error('Expected request failure');
        } catch (error) {
            expect(error).toBeInstanceOf(RestApiError);
            expect((error as RestApiError).status).toBe(400);
            expect((error as RestApiError).message).toBe('Invalid cursor.');
        }
    });

    it('keeps HTTP errors readable when the server returns an empty or malformed problem', async () => {
        for (const body of [null, 'upstream failed', { detail: 42 }]) {
            globalThis.fetch = (async () => Response.json(body, { status: 502 })) as typeof fetch;
            await expect(requestRest('robots')).rejects.toThrow('Request failed (502).');
        }
    });

    it('posts password login directly to the website REST API', async () => {
        setDesktopEnvironmentSettings(buildDesktopEnvironmentSettingsFromProcessEnv({ NEXT_PUBLIC_ENVIRONMENT: 'production' }));
        globalThis.fetch = (async (input, init) => {
            expect(String(input)).toBe('https://api.vulcanrobotics.ai/v1/auth/login');
            expect(init?.method).toBe('POST');
            expect(init?.credentials).toBe('omit');
            expect(JSON.parse(String(init?.body))).toEqual({ email: 'test@example.com', password: 'test-password', provider: 0 });
            return Response.json({ account: { id: 'account-1', email: 'test@example.com', profile: { name: 'Test' } }, created: false });
        }) as typeof fetch;
        const result = await mutateStudioLogin({ email: 'test@example.com', password: 'test-password', provider: 0 });
        expect(result.account?.id).toBe('account-1');
        expect(result.account?.profile?.name).toBe('Test');
    });

    it('preserves REST login errors and rejects malformed success responses', async () => {
        globalThis.fetch = (async () => Response.json({ detail: 'Invalid email or password.', code: 'invalid_credentials' }, { status: 401 })) as typeof fetch;
        const login = () => mutateStudioLogin({ email: 'test@example.com', password: 'invalid', provider: 0 });
        try {
            await login();
            throw new Error('Expected login failure');
        } catch (error) {
            expect(error).toBeInstanceOf(StudioLoginError);
            expect((error as StudioLoginError).status).toBe(401);
            expect((error as StudioLoginError).code).toBe('invalid_credentials');
            expect((error as Error).message).toBe('Invalid email or password.');
        }
        globalThis.fetch = (async () => Response.json({})) as typeof fetch;
        await expect(login()).rejects.toThrow('Login returned an invalid account.');
    });

    it('starts desktop OAuth at the new route and encodes the callback', () => {
        for (const provider of ['google', 'github'] as const) {
            const callback = 'tauri://localhost/desktop/auth/callback/';
            const url = new URL(buildOAuthRedirectUrl('https://api.vulcanrobotics.ai/v1/', provider, callback));
            expect(url.pathname).toBe(`/v1/auth/${provider}`);
            expect(url.searchParams.get('redirect_uri')).toBe(callback);
        }
    });
});
