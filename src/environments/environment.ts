import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
    DesktopEnvironment,
    DesktopEnvironmentSettings,
    SaveDesktopEnvironmentSettingsRequest,
} from '@/types/desktop-environment';

export const DESKTOP_ENVIRONMENT_KEY = ['desktop', 'environment-settings'];

const PRODUCTION_GRAPHQL_API_URL = 'https://api.studio.vulcanrobotics.ai/graphql';
const PRODUCTION_ACCOUNT_SUMMARY_URL = 'https://api.studio.vulcanrobotics.ai/api/account-summary';
const PRODUCTION_AUTH_GOOGLE_URL = 'https://api.studio.vulcanrobotics.ai/api/v1/auth/google';
const PRODUCTION_AUTH_GITHUB_URL = 'https://api.studio.vulcanrobotics.ai/api/v1/auth/github';
const PRODUCTION_UPDATER_MANIFEST_URL = 'https://sourccey.nyc3.cdn.digitaloceanspaces.com/updater/latest.json';

const STAGING_GRAPHQL_API_URL = 'https://api.staging.factory.studio.vulcanrobotics.ai/graphql';
const STAGING_ACCOUNT_SUMMARY_URL = 'https://api.staging.factory.studio.vulcanrobotics.ai/api/account-summary';
const STAGING_AUTH_GOOGLE_URL = 'https://api.staging.factory.studio.vulcanrobotics.ai/api/v1/auth/google';
const STAGING_AUTH_GITHUB_URL = 'https://api.staging.factory.studio.vulcanrobotics.ai/api/v1/auth/github';
const STAGING_UPDATER_MANIFEST_URL = 'https://sourccey-staging.nyc3.cdn.digitaloceanspaces.com/updater/latest.json';

const DEFAULT_LOCAL_DESKTOP_GRAPHQL_API_URL = 'http://192.168.1.220:5200/graphql';
const DEFAULT_LOCAL_DESKTOP_ACCOUNT_SUMMARY_URL = 'http://192.168.1.220:5200/api/account-summary';
const DEFAULT_LOCAL_DESKTOP_AUTH_GOOGLE_URL = 'http://192.168.1.220:5200/api/v1/auth/google';
const DEFAULT_LOCAL_DESKTOP_AUTH_GITHUB_URL = 'http://192.168.1.220:5200/api/v1/auth/github';
const DEFAULT_LOCAL_DESKTOP_UPDATER_MANIFEST_URL = 'http://192.168.1.220:3000/latest.json';

type DesktopEnvironmentProcessEnv = {
    NEXT_PUBLIC_ENVIRONMENT?: string;
    NEXT_PUBLIC_GRAPHQL_API_URL?: string;
    NEXT_PUBLIC_ACCOUNT_SUMMARY_URL?: string;
    NEXT_PUBLIC_AUTH_GOOGLE_URL?: string;
    NEXT_PUBLIC_AUTH_GITHUB_URL?: string;
    NEXT_PUBLIC_UPDATER_MANIFEST_URL?: string;
} & Record<string, string | undefined>;

let cachedDesktopEnvironmentSettings: DesktopEnvironmentSettings | null = null;
let desktopEnvironmentPromise: Promise<DesktopEnvironmentSettings> | null = null;

const normalizeUrl = (value: string) => {
    const raw = value.trim();
    if (!raw) {
        throw new Error('URL cannot be empty');
    }

    const withScheme = raw.includes('://') ? raw : `http://${raw}`;
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('URL must use http or https');
    }
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
};

const resolveDesktopEnvironment = (value?: string | null): DesktopEnvironment => {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'staging') return 'staging';
    if (normalized === 'local' || normalized === 'developer' || normalized === 'dev') return 'local';
    return 'production';
};

const buildResolvedDesktopEnvironmentSettings = (
    environment: DesktopEnvironment,
    customGraphqlApiUrl: string,
    customAccountSummaryUrl: string,
    customAuthGoogleUrl: string,
    customAuthGithubUrl: string,
    customUpdaterManifestUrl: string
): DesktopEnvironmentSettings => {
    const displayName = environment === 'production' ? 'Production' : environment === 'staging' ? 'Staging' : 'Developer';
    const badgeLabel = environment === 'production' ? null : environment === 'staging' ? 'STAGING' : 'DEV MODE';

    if (environment === 'production') {
        return {
            environment,
            displayName,
            badgeLabel,
            customGraphqlApiUrl,
            customAccountSummaryUrl,
            customAuthGoogleUrl,
            customAuthGithubUrl,
            customUpdaterManifestUrl,
            graphqlApiUrl: PRODUCTION_GRAPHQL_API_URL,
            accountSummaryUrl: PRODUCTION_ACCOUNT_SUMMARY_URL,
            authGoogleUrl: PRODUCTION_AUTH_GOOGLE_URL,
            authGithubUrl: PRODUCTION_AUTH_GITHUB_URL,
            updaterManifestUrl: PRODUCTION_UPDATER_MANIFEST_URL,
        };
    }

    if (environment === 'staging') {
        return {
            environment,
            displayName,
            badgeLabel,
            customGraphqlApiUrl,
            customAccountSummaryUrl,
            customAuthGoogleUrl,
            customAuthGithubUrl,
            customUpdaterManifestUrl,
            graphqlApiUrl: STAGING_GRAPHQL_API_URL,
            accountSummaryUrl: STAGING_ACCOUNT_SUMMARY_URL,
            authGoogleUrl: STAGING_AUTH_GOOGLE_URL,
            authGithubUrl: STAGING_AUTH_GITHUB_URL,
            updaterManifestUrl: STAGING_UPDATER_MANIFEST_URL,
        };
    }

    return {
        environment,
        displayName,
        badgeLabel,
        customGraphqlApiUrl,
        customAccountSummaryUrl,
        customAuthGoogleUrl,
        customAuthGithubUrl,
        customUpdaterManifestUrl,
        graphqlApiUrl: customGraphqlApiUrl,
        accountSummaryUrl: customAccountSummaryUrl,
        authGoogleUrl: customAuthGoogleUrl,
        authGithubUrl: customAuthGithubUrl,
        updaterManifestUrl: customUpdaterManifestUrl,
    };
};

export const buildDesktopEnvironmentSettingsFromProcessEnv = (
    env: DesktopEnvironmentProcessEnv = process.env
): DesktopEnvironmentSettings => {
    const environment = resolveDesktopEnvironment(env.NEXT_PUBLIC_ENVIRONMENT);
    const customGraphqlApiUrl = normalizeUrl(env.NEXT_PUBLIC_GRAPHQL_API_URL ?? DEFAULT_LOCAL_DESKTOP_GRAPHQL_API_URL);
    const customAccountSummaryUrl = normalizeUrl(
        env.NEXT_PUBLIC_ACCOUNT_SUMMARY_URL ?? DEFAULT_LOCAL_DESKTOP_ACCOUNT_SUMMARY_URL
    );
    const customAuthGoogleUrl = normalizeUrl(env.NEXT_PUBLIC_AUTH_GOOGLE_URL ?? DEFAULT_LOCAL_DESKTOP_AUTH_GOOGLE_URL);
    const customAuthGithubUrl = normalizeUrl(env.NEXT_PUBLIC_AUTH_GITHUB_URL ?? DEFAULT_LOCAL_DESKTOP_AUTH_GITHUB_URL);
    const customUpdaterManifestUrl = normalizeUrl(
        env.NEXT_PUBLIC_UPDATER_MANIFEST_URL ?? DEFAULT_LOCAL_DESKTOP_UPDATER_MANIFEST_URL
    );

    return buildResolvedDesktopEnvironmentSettings(
        environment,
        customGraphqlApiUrl,
        customAccountSummaryUrl,
        customAuthGoogleUrl,
        customAuthGithubUrl,
        customUpdaterManifestUrl
    );
};

export const resolveClientDesktopEnvironmentSettings = (
    request: SaveDesktopEnvironmentSettingsRequest
): DesktopEnvironmentSettings => {
    const environment = resolveDesktopEnvironment(request.environment);
    const customGraphqlApiUrl = normalizeUrl(
        request.customGraphqlApiUrl ?? DEFAULT_LOCAL_DESKTOP_GRAPHQL_API_URL
    );
    const customAccountSummaryUrl = normalizeUrl(
        request.customAccountSummaryUrl ?? DEFAULT_LOCAL_DESKTOP_ACCOUNT_SUMMARY_URL
    );
    const customAuthGoogleUrl = normalizeUrl(
        request.customAuthGoogleUrl ?? DEFAULT_LOCAL_DESKTOP_AUTH_GOOGLE_URL
    );
    const customAuthGithubUrl = normalizeUrl(
        request.customAuthGithubUrl ?? DEFAULT_LOCAL_DESKTOP_AUTH_GITHUB_URL
    );
    const customUpdaterManifestUrl = normalizeUrl(
        request.customUpdaterManifestUrl ?? DEFAULT_LOCAL_DESKTOP_UPDATER_MANIFEST_URL
    );

    return buildResolvedDesktopEnvironmentSettings(
        environment,
        customGraphqlApiUrl,
        customAccountSummaryUrl,
        customAuthGoogleUrl,
        customAuthGithubUrl,
        customUpdaterManifestUrl
    );
};

export const getDefaultDesktopEnvironmentSettings = () => buildDesktopEnvironmentSettingsFromProcessEnv();

export const setDesktopEnvironmentSettings = (settings: DesktopEnvironmentSettings) => {
    cachedDesktopEnvironmentSettings = settings;
    return settings;
};

export const getCachedDesktopEnvironmentSettings = () => cachedDesktopEnvironmentSettings;

const fetchDesktopEnvironmentSettings = async (): Promise<DesktopEnvironmentSettings> => {
    if (!isTauri()) {
        return setDesktopEnvironmentSettings(getDefaultDesktopEnvironmentSettings());
    }

    const settings = await invoke<DesktopEnvironmentSettings>('get_desktop_environment_settings');
    return setDesktopEnvironmentSettings(settings);
};

export const primeDesktopEnvironmentSettings = async (): Promise<DesktopEnvironmentSettings> => {
    if (cachedDesktopEnvironmentSettings) {
        return cachedDesktopEnvironmentSettings;
    }
    if (!desktopEnvironmentPromise) {
        desktopEnvironmentPromise = fetchDesktopEnvironmentSettings().finally(() => {
            desktopEnvironmentPromise = null;
        });
    }
    return desktopEnvironmentPromise;
};

export const getDesktopEnvironmentSettings = async (): Promise<DesktopEnvironmentSettings> => {
    return cachedDesktopEnvironmentSettings ?? (await primeDesktopEnvironmentSettings());
};
