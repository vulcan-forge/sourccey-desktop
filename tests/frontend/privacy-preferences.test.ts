// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import {
    applyDataSharingChoice,
    applyTelemetryChoice,
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

    it('keeps telemetry and robot-data sharing independent', () => {
        const telemetryEnabled = applyTelemetryChoice(
            {
                diagnosticsEnabled: false,
                datasetMetadataEnabled: false,
                trajectoryUploadEnabled: false,
                cameraUploadEnabled: false,
            },
            true
        );

        expect(telemetryEnabled).toEqual({
            diagnosticsEnabled: true,
            datasetMetadataEnabled: false,
            trajectoryUploadEnabled: false,
            cameraUploadEnabled: false,
        });

        expect(applyDataSharingChoice(telemetryEnabled, true)).toEqual({
            diagnosticsEnabled: true,
            datasetMetadataEnabled: true,
            trajectoryUploadEnabled: true,
            cameraUploadEnabled: true,
        });
    });
});
