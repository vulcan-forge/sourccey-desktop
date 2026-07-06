export type DesktopEnvironment = 'production' | 'staging' | 'local';

export interface DesktopEnvironmentSettings {
    environment: DesktopEnvironment;
    displayName: string;
    badgeLabel: string | null;
    teleopLogLevel: 'debug' | 'info' | 'warning' | 'error';
    customGraphqlApiUrl: string;
    customStudioWebUrl: string;
    customUpdaterManifestUrl: string;
    graphqlApiUrl: string;
    studioWebUrl: string;
    updaterManifestUrl: string;
}

export interface SaveDesktopEnvironmentSettingsRequest {
    environment: DesktopEnvironment;
    teleopLogLevel?: 'debug' | 'info' | 'warning' | 'error';
    customGraphqlApiUrl?: string;
    customStudioWebUrl?: string;
    customUpdaterManifestUrl?: string;
}
