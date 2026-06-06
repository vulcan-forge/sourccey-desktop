export type KioskEnvironment = 'production' | 'staging' | 'local';

export interface KioskEnvironmentSettings {
    environment: KioskEnvironment;
    displayName: string;
    badgeLabel: string | null;
    customBaseUrl: string;
    appBaseUrl: string;
    apiBaseUrl: string;
}

export interface SaveKioskEnvironmentSettingsRequest {
    environment: KioskEnvironment;
    customBaseUrl?: string;
}
