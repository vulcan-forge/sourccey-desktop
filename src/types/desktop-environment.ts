export type DesktopEnvironment = 'production' | 'staging' | 'local';

export interface DesktopEnvironmentSettings {
    environment: DesktopEnvironment;
    displayName: string;
    badgeLabel: string | null;
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
    customGraphqlApiUrl?: string;
    customAccountSummaryUrl?: string;
    customAuthGoogleUrl?: string;
    customAuthGithubUrl?: string;
    customUpdaterManifestUrl?: string;
}
