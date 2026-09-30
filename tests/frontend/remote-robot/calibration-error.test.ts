// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import {
    CALIBRATION_TOAST_ERROR_MESSAGE,
    getCalibrationErrorMessage,
    getCalibrationToastErrorMessage,
} from '../../../src/components/Elements/Robot/calibration-error';

describe('getCalibrationErrorMessage', () => {
    it('extracts useful messages and normalizes empty errors', () => {
        expect(getCalibrationErrorMessage('Calibration failed on robot')).toBe('Calibration failed on robot');
        expect(getCalibrationErrorMessage({ message: 'Serial port unavailable' })).toBe('Serial port unavailable');
        expect(getCalibrationErrorMessage('   ')).toBe('Unknown error');
        expect(getCalibrationErrorMessage({ message: '' })).toBe('Unknown error');
        expect(getCalibrationErrorMessage(null)).toBe('Unknown error');
    });
});

describe('getCalibrationToastErrorMessage', () => {
    it('keeps multiline and oversized details out of the toast', () => {
        const error = 'Port open failed\nTraceback line 1\nTraceback line 2';
        expect(getCalibrationToastErrorMessage(error)).toBe(CALIBRATION_TOAST_ERROR_MESSAGE);
        const longMessage = `Calibration failed: ${'x'.repeat(500)}`;
        expect(getCalibrationToastErrorMessage(longMessage)).toBe(CALIBRATION_TOAST_ERROR_MESSAGE);
    });
});
