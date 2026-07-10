// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import {
    buildDesktopEnvironmentSettingsFromProcessEnv,
    resolveClientDesktopEnvironmentSettings,
} from '../../src/environments/environment';

describe('desktop environment settings', () => {
    it('builds staging settings from process env with the expected badge', () => {
        const settings = buildDesktopEnvironmentSettingsFromProcessEnv({
            NEXT_PUBLIC_ENVIRONMENT: 'staging',
            NEXT_PUBLIC_GRAPHQL_API_URL: 'http://ignored.local/graphql',
            NEXT_PUBLIC_STUDIO_WEB_URL: 'http://ignored.local:3000',
            NEXT_PUBLIC_UPDATER_MANIFEST_URL: 'http://ignored.local/latest.json',
        });

        expect(settings.environment).toBe('staging');
        expect(settings.displayName).toBe('Staging');
        expect(settings.badgeLabel).toBe('STAGING');
        expect(settings.teleopLogLevel).toBe('warning');
        expect(settings.graphqlApiUrl).toBe('https://api.staging.factory.studio.vulcanrobotics.ai/v1/graphql');
        expect(settings.studioWebUrl).toBe('https://staging.factory.studio.vulcanrobotics.ai');
        expect(settings.updaterManifestUrl).toBe('https://sourccey-staging.nyc3.cdn.digitaloceanspaces.com/updater/latest.json');
    });

    it('resolves developer settings from custom runtime urls', () => {
        const settings = resolveClientDesktopEnvironmentSettings({
            environment: 'local',
            customGraphqlApiUrl: 'dev-box.local:5200/v1/graphql',
            customStudioWebUrl: 'dev-box.local:3000',
            customUpdaterManifestUrl: 'dev-box.local:3000/latest.json',
        });

        expect(settings.environment).toBe('local');
        expect(settings.displayName).toBe('Developer');
        expect(settings.badgeLabel).toBe('DEV MODE');
        expect(settings.teleopLogLevel).toBe('warning');
        expect(settings.graphqlApiUrl).toBe('http://dev-box.local:5200/v1/graphql');
        expect(settings.studioWebUrl).toBe('http://dev-box.local:3000');
        expect(settings.updaterManifestUrl).toBe('http://dev-box.local:3000/latest.json');
    });
});
