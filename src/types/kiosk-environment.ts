export type KioskEnvironment = 'production' | 'staging' | 'local';

export interface KioskEnvironmentSettings {
    environment: KioskEnvironment;
    displayName: string;
    badgeLabel: string | null;
    customAppBaseUrl: string;
    customApiBaseUrl: string;
    appBaseUrl: string;
    apiBaseUrl: string;
}

export interface SaveKioskEnvironmentSettingsRequest {
    environment: KioskEnvironment;
    customAppBaseUrl?: string;
    customApiBaseUrl?: string;
}
