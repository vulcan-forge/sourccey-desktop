// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import {
    buildDesktopEnvironmentSettingsFromProcessEnv,
    resolveClientDesktopEnvironmentSettings,
    normalizeRestApiUrl,
} from '../../src/environments/environment';

describe('desktop environment settings', () => {
    it('builds staging settings from process env with the expected badge', () => {
        const settings = buildDesktopEnvironmentSettingsFromProcessEnv({
            NEXT_PUBLIC_ENVIRONMENT: 'staging',
            NEXT_PUBLIC_REST_API_URL: 'http://ignored.local/graphql',
            NEXT_PUBLIC_STUDIO_WEB_URL: 'http://ignored.local:3000',
            NEXT_PUBLIC_UPDATER_MANIFEST_URL: 'http://ignored.local/latest.json',
        });

        expect(settings.environment).toBe('staging');
        expect(settings.displayName).toBe('Staging');
        expect(settings.badgeLabel).toBe('STAGING');
        expect(settings.teleopLogLevel).toBe('warning');
        expect(settings.restApiUrl).toBe('https://api.staging.factory.studio.vulcanrobotics.ai/v1');
        expect(settings.websiteApiUrl).toBe('https://api.staging.factory.vulcanrobotics.ai/v1');
        expect(settings.studioWebUrl).toBe('https://staging.factory.studio.vulcanrobotics.ai');
        expect(settings.updaterManifestUrl).toBe('https://sourccey-staging.nyc3.cdn.digitaloceanspaces.com/updater/latest.json');
    });

    it('resolves developer settings from custom runtime urls', () => {
        const settings = resolveClientDesktopEnvironmentSettings({
            environment: 'local',
            customRestApiUrl: 'dev-box.local:5200/v1',
            customStudioWebUrl: 'dev-box.local:3000',
            customUpdaterManifestUrl: 'dev-box.local:3000/latest.json',
        });

        expect(settings.environment).toBe('local');
        expect(settings.displayName).toBe('Developer');
        expect(settings.badgeLabel).toBe('DEV MODE');
        expect(settings.teleopLogLevel).toBe('warning');
        expect(settings.restApiUrl).toBe('http://dev-box.local:5200/v1');
        expect(settings.websiteApiUrl).toBe(settings.restApiUrl);
        expect(settings.studioWebUrl).toBe('http://dev-box.local:3000');
        expect(settings.updaterManifestUrl).toBe('http://dev-box.local:3000/latest.json');
    });

    it('migrates legacy environment URLs and prefers the REST variable', () => {
        const legacy = buildDesktopEnvironmentSettingsFromProcessEnv({
            NEXT_PUBLIC_ENVIRONMENT: 'local',
            NEXT_PUBLIC_GRAPHQL_API_URL: 'dev-box.local:5200/v1/graphql/',
        });
        expect(legacy.restApiUrl).toBe('http://dev-box.local:5200/v1');
        const current = buildDesktopEnvironmentSettingsFromProcessEnv({
            NEXT_PUBLIC_ENVIRONMENT: 'local',
            NEXT_PUBLIC_GRAPHQL_API_URL: 'dev-box.local:5200/v1/graphql',
            NEXT_PUBLIC_REST_API_URL: 'https://localhost:5001/api/v1',
        });
        expect(current.websiteApiUrl).toBe('https://localhost:5001/v1');
        expect(normalizeRestApiUrl('http://host/proxy/v1/graphql')).toBe('http://host/proxy/v1');
        expect(normalizeRestApiUrl('http://host')).toBe('http://host/v1');
        expect(() => normalizeRestApiUrl('ftp://host/v1')).toThrow();
    });
});
