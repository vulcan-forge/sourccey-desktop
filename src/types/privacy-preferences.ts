export interface PrivacyPreferences {
    onboardingCompleted: boolean;
    onboardingVersion: number;
    privacyNoticeVersion: number;
    diagnosticsEnabled: boolean;
    datasetMetadataEnabled: boolean;
    trajectoryUploadEnabled: boolean;
    cameraUploadEnabled: boolean;
    decidedAt: string | null;
    updatedAt: string;
}

export type SavePrivacyPreferencesRequest = Pick<
    PrivacyPreferences,
    'diagnosticsEnabled' | 'datasetMetadataEnabled' | 'trajectoryUploadEnabled' | 'cameraUploadEnabled'
>;
