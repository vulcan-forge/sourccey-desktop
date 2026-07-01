export type DesktopEnvironment = 'production' | 'staging' | 'local';

export interface DesktopEnvironmentSettings {
    environment: DesktopEnvironment;
    displayName: string;
    badgeLabel: string | null;
    teleopLogLevel: 'debug' | 'info' | 'warning' | 'error';
    customGraphqlApiUrl: string;
    customAccountSummaryUrl: string;
    customAuthGoogleUrl: string;
    customAuthGithubUrl: string;
    customUpdaterManifestUrl: string;
    graphqlApiUrl: string;
    accountSummaryUrl: string;
    authGoogleUrl: string;
    authGithubUrl: string;
    updaterManifestUrl: string;
}

export interface SaveDesktopEnvironmentSettingsRequest {
    environment: DesktopEnvironment;
    teleopLogLevel?: 'debug' | 'info' | 'warning' | 'error';
    customGraphqlApiUrl?: string;
    customAccountSummaryUrl?: string;
    customAuthGoogleUrl?: string;
    customAuthGithubUrl?: string;
    customUpdaterManifestUrl?: string;
}
