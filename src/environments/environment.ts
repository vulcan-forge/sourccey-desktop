import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
    DesktopEnvironment,
    DesktopEnvironmentSettings,
    SaveDesktopEnvironmentSettingsRequest,
} from '@/types/desktop-environment';

export const DESKTOP_ENVIRONMENT_KEY = ['desktop', 'environment-settings'];

const PRODUCTION_REST_API_URL = 'https://api.studio.vulcanrobotics.ai/v1';
const PRODUCTION_STUDIO_WEB_URL = 'https://studio.vulcanrobotics.ai';
const PRODUCTION_UPDATER_MANIFEST_URL = 'https://sourccey.nyc3.cdn.digitaloceanspaces.com/updater/latest.json';

const STAGING_REST_API_URL = 'https://api.staging.factory.studio.vulcanrobotics.ai/v1';
const STAGING_STUDIO_WEB_URL = 'https://staging.factory.studio.vulcanrobotics.ai';
const STAGING_UPDATER_MANIFEST_URL = 'https://sourccey-staging.nyc3.cdn.digitaloceanspaces.com/updater/latest.json';

const DEFAULT_LOCAL_DESKTOP_REST_API_URL = 'http://192.168.1.220:5200/v1';
const DEFAULT_LOCAL_DESKTOP_STUDIO_WEB_URL = 'http://192.168.1.220:3000';
const DEFAULT_LOCAL_DESKTOP_UPDATER_MANIFEST_URL = 'http://192.168.1.220:3000/latest.json';
const DEFAULT_TELEOP_LOG_LEVEL = 'warning';

type DesktopEnvironmentProcessEnv = {
    NEXT_PUBLIC_ENVIRONMENT?: string;
    NEXT_PUBLIC_REST_API_URL?: string;
    NEXT_PUBLIC_GRAPHQL_API_URL?: string;
    NEXT_PUBLIC_STUDIO_WEB_URL?: string;
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

// Accept URLs saved by desktop versions that configured a GraphQL endpoint.
export const normalizeRestApiUrl = (value: string) => {
    const url = new URL(normalizeUrl(value));
    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(?:v1\/graphql|api\/v1|v1)$/, '') + '/v1';
    url.search = '';
    return url.toString().replace(/\/$/, '');
};

const resolveDesktopEnvironment = (value?: string | null): DesktopEnvironment => {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'staging') return 'staging';
    if (normalized === 'local' || normalized === 'developer' || normalized === 'dev') return 'local';
    return 'production';
};

const buildResolvedDesktopEnvironmentSettings = (
    environment: DesktopEnvironment,
    teleopLogLevel: DesktopEnvironmentSettings['teleopLogLevel'],
    customRestApiUrl: string,
    customStudioWebUrl: string,
    customUpdaterManifestUrl: string
): DesktopEnvironmentSettings => {
    const displayName = environment === 'production' ? 'Production' : environment === 'staging' ? 'Staging' : 'Developer';
    const badgeLabel = environment === 'production' ? null : environment === 'staging' ? 'STAGING' : 'DEV MODE';

    if (environment === 'production') {
        return {
            environment,
            displayName,
            badgeLabel,
            teleopLogLevel,
            customRestApiUrl,
            customStudioWebUrl,
            customUpdaterManifestUrl,
            restApiUrl: PRODUCTION_REST_API_URL,
            websiteApiUrl: 'https://api.vulcanrobotics.ai/v1',
            studioWebUrl: PRODUCTION_STUDIO_WEB_URL,
            updaterManifestUrl: PRODUCTION_UPDATER_MANIFEST_URL,
        };
    }

    if (environment === 'staging') {
        return {
            environment,
            displayName,
            badgeLabel,
            teleopLogLevel,
            customRestApiUrl,
            customStudioWebUrl,
            customUpdaterManifestUrl,
            restApiUrl: STAGING_REST_API_URL,
            websiteApiUrl: 'https://api.staging.factory.vulcanrobotics.ai/v1',
            studioWebUrl: STAGING_STUDIO_WEB_URL,
            updaterManifestUrl: STAGING_UPDATER_MANIFEST_URL,
        };
    }

    return {
        environment,
        displayName,
        badgeLabel,
        teleopLogLevel,
        customRestApiUrl,
        customStudioWebUrl,
        customUpdaterManifestUrl,
        restApiUrl: customRestApiUrl,
        websiteApiUrl: customRestApiUrl,
        studioWebUrl: customStudioWebUrl,
        updaterManifestUrl: customUpdaterManifestUrl,
    };
};

export const buildDesktopEnvironmentSettingsFromProcessEnv = (
    env: DesktopEnvironmentProcessEnv = {
        NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT,
        NEXT_PUBLIC_REST_API_URL: process.env.NEXT_PUBLIC_REST_API_URL,
        NEXT_PUBLIC_GRAPHQL_API_URL: process.env.NEXT_PUBLIC_GRAPHQL_API_URL,
        NEXT_PUBLIC_STUDIO_WEB_URL: process.env.NEXT_PUBLIC_STUDIO_WEB_URL,
        NEXT_PUBLIC_UPDATER_MANIFEST_URL: process.env.NEXT_PUBLIC_UPDATER_MANIFEST_URL,
    }
): DesktopEnvironmentSettings => {
    const environment = resolveDesktopEnvironment(env.NEXT_PUBLIC_ENVIRONMENT);
    const customRestApiUrl = normalizeRestApiUrl(
        env.NEXT_PUBLIC_REST_API_URL ?? env.NEXT_PUBLIC_GRAPHQL_API_URL ?? DEFAULT_LOCAL_DESKTOP_REST_API_URL
    );
    const customStudioWebUrl = normalizeUrl(env.NEXT_PUBLIC_STUDIO_WEB_URL ?? DEFAULT_LOCAL_DESKTOP_STUDIO_WEB_URL);
    const customUpdaterManifestUrl = normalizeUrl(
        env.NEXT_PUBLIC_UPDATER_MANIFEST_URL ?? DEFAULT_LOCAL_DESKTOP_UPDATER_MANIFEST_URL
    );

    return buildResolvedDesktopEnvironmentSettings(
        environment,
        DEFAULT_TELEOP_LOG_LEVEL,
        customRestApiUrl,
        customStudioWebUrl,
        customUpdaterManifestUrl
    );
};

export const resolveClientDesktopEnvironmentSettings = (
    request: SaveDesktopEnvironmentSettingsRequest
): DesktopEnvironmentSettings => {
    const environment = resolveDesktopEnvironment(request.environment);
    const customRestApiUrl = normalizeRestApiUrl(
        request.customRestApiUrl ?? DEFAULT_LOCAL_DESKTOP_REST_API_URL
    );
    const customStudioWebUrl = normalizeUrl(request.customStudioWebUrl ?? DEFAULT_LOCAL_DESKTOP_STUDIO_WEB_URL);
    const customUpdaterManifestUrl = normalizeUrl(
        request.customUpdaterManifestUrl ?? DEFAULT_LOCAL_DESKTOP_UPDATER_MANIFEST_URL
    );
    const teleopLogLevel =
        request.teleopLogLevel ?? cachedDesktopEnvironmentSettings?.teleopLogLevel ?? DEFAULT_TELEOP_LOG_LEVEL;

    return buildResolvedDesktopEnvironmentSettings(
        environment,
        teleopLogLevel,
        customRestApiUrl,
        customStudioWebUrl,
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
