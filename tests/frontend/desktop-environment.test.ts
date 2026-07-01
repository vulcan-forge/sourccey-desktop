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
            NEXT_PUBLIC_ACCOUNT_SUMMARY_URL: 'http://ignored.local/account-summary',
            NEXT_PUBLIC_AUTH_GOOGLE_URL: 'http://ignored.local/google',
            NEXT_PUBLIC_AUTH_GITHUB_URL: 'http://ignored.local/github',
            NEXT_PUBLIC_UPDATER_MANIFEST_URL: 'http://ignored.local/latest.json',
        });

        expect(settings.environment).toBe('staging');
        expect(settings.displayName).toBe('Staging');
        expect(settings.badgeLabel).toBe('STAGING');
        expect(settings.teleopLogLevel).toBe('warning');
        expect(settings.graphqlApiUrl).toBe('https://api.staging.factory.studio.vulcanrobotics.ai/graphql');
        expect(settings.updaterManifestUrl).toBe('https://sourccey-staging.nyc3.cdn.digitaloceanspaces.com/updater/latest.json');
    });

    it('resolves developer settings from custom runtime urls', () => {
        const settings = resolveClientDesktopEnvironmentSettings({
            environment: 'local',
            customGraphqlApiUrl: 'dev-box.local:5200/graphql',
            customAccountSummaryUrl: 'dev-box.local:5200/api/account-summary',
            customAuthGoogleUrl: 'dev-box.local:5200/api/v1/auth/google',
            customAuthGithubUrl: 'dev-box.local:5200/api/v1/auth/github',
            customUpdaterManifestUrl: 'dev-box.local:3000/latest.json',
        });

        expect(settings.environment).toBe('local');
        expect(settings.displayName).toBe('Developer');
        expect(settings.badgeLabel).toBe('DEV MODE');
        expect(settings.teleopLogLevel).toBe('warning');
        expect(settings.graphqlApiUrl).toBe('http://dev-box.local:5200/graphql');
        expect(settings.accountSummaryUrl).toBe('http://dev-box.local:5200/api/account-summary');
        expect(settings.authGoogleUrl).toBe('http://dev-box.local:5200/api/v1/auth/google');
        expect(settings.authGithubUrl).toBe('http://dev-box.local:5200/api/v1/auth/github');
        expect(settings.updaterManifestUrl).toBe('http://dev-box.local:3000/latest.json');
    });
});
