import type { PrivacyPreferences, SavePrivacyPreferencesRequest } from '@/types/privacy-preferences';

export const CURRENT_ONBOARDING_VERSION = 1;
export const CURRENT_PRIVACY_NOTICE_VERSION = 1;

export const createDefaultPrivacyPreferences = (): PrivacyPreferences => ({
    onboardingCompleted: false,
    onboardingVersion: 0,
    privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
    diagnosticsEnabled: false,
    datasetMetadataEnabled: false,
    trajectoryUploadEnabled: false,
    cameraUploadEnabled: false,
    decidedAt: null,
    updatedAt: new Date(0).toISOString(),
});

export const parseStoredPrivacyPreferences = (stored: string | null): PrivacyPreferences => {
    if (!stored) return createDefaultPrivacyPreferences();
    try {
        return { ...createDefaultPrivacyPreferences(), ...(JSON.parse(stored) as Partial<PrivacyPreferences>) };
    } catch {
        return createDefaultPrivacyPreferences();
    }
};

export const completePrivacyPreferences = (
    current: PrivacyPreferences,
    choices: SavePrivacyPreferencesRequest,
    now: string
): PrivacyPreferences => ({
    ...current,
    ...choices,
    onboardingCompleted: true,
    onboardingVersion: CURRENT_ONBOARDING_VERSION,
    privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
    decidedAt: now,
    updatedAt: now,
});

export const isProductImprovementEnabled = (choices: SavePrivacyPreferencesRequest): boolean =>
    choices.diagnosticsEnabled && choices.datasetMetadataEnabled;

export const applyProductImprovementChoice = (
    current: SavePrivacyPreferencesRequest,
    enabled: boolean
): SavePrivacyPreferencesRequest => ({
    ...current,
    diagnosticsEnabled: enabled,
    datasetMetadataEnabled: enabled,
});

export const isAiRecordingContributionEnabled = (choices: SavePrivacyPreferencesRequest): boolean =>
    choices.trajectoryUploadEnabled && choices.cameraUploadEnabled;

export const applyAiRecordingContributionChoice = (
    current: SavePrivacyPreferencesRequest,
    enabled: boolean
): SavePrivacyPreferencesRequest => ({
    ...current,
    trajectoryUploadEnabled: enabled,
    cameraUploadEnabled: enabled,
});
