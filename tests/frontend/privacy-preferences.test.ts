// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import {
    applyAiRecordingContributionChoice,
    applyProductImprovementChoice,
    completePrivacyPreferences,
    createDefaultPrivacyPreferences,
    parseStoredPrivacyPreferences,
} from '../../src/settings/privacy-preferences';

describe('privacy preferences', () => {
    it('starts incomplete with every optional data category disabled', () => {
        expect(createDefaultPrivacyPreferences()).toMatchObject({
            onboardingCompleted: false,
            diagnosticsEnabled: false,
            datasetMetadataEnabled: false,
            trajectoryUploadEnabled: false,
            cameraUploadEnabled: false,
        });
    });

    it('falls back to privacy-preserving defaults for malformed storage', () => {
        expect(parseStoredPrivacyPreferences('{not-json')).toEqual(createDefaultPrivacyPreferences());
    });

    it('records completion without enabling choices the user left off', () => {
        const completed = completePrivacyPreferences(
            createDefaultPrivacyPreferences(),
            {
                diagnosticsEnabled: true,
                datasetMetadataEnabled: false,
                trajectoryUploadEnabled: false,
                cameraUploadEnabled: false,
            },
            '2026-09-26T12:00:00.000Z'
        );

        expect(completed.onboardingCompleted).toBe(true);
        expect(completed.diagnosticsEnabled).toBe(true);
        expect(completed.datasetMetadataEnabled).toBe(false);
        expect(completed.cameraUploadEnabled).toBe(false);
    });

    it('keeps product diagnostics separate from robot recording consent', () => {
        const diagnosticsEnabled = applyProductImprovementChoice(
            {
                diagnosticsEnabled: false,
                datasetMetadataEnabled: false,
                trajectoryUploadEnabled: false,
                cameraUploadEnabled: false,
            },
            true
        );

        expect(diagnosticsEnabled).toEqual({
            diagnosticsEnabled: true,
            datasetMetadataEnabled: true,
            trajectoryUploadEnabled: false,
            cameraUploadEnabled: false,
        });

        expect(applyAiRecordingContributionChoice(diagnosticsEnabled, true)).toEqual({
            diagnosticsEnabled: true,
            datasetMetadataEnabled: true,
            trajectoryUploadEnabled: true,
            cameraUploadEnabled: true,
        });
    });
});
