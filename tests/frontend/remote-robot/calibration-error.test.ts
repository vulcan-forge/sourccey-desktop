// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import {
    CALIBRATION_TOAST_ERROR_MESSAGE,
    getCalibrationErrorMessage,
    getCalibrationToastErrorMessage,
} from '../../../src/components/Elements/Robot/calibration-error';

describe('getCalibrationErrorMessage', () => {
    it('returns direct string errors', () => {
        expect(getCalibrationErrorMessage('Calibration failed on robot')).toBe('Calibration failed on robot');
    });

    it('returns the message field when error is an object', () => {
        expect(getCalibrationErrorMessage({ message: 'Serial port unavailable' })).toBe('Serial port unavailable');
    });

    it('returns unknown error for empty values', () => {
        expect(getCalibrationErrorMessage('   ')).toBe('Unknown error');
        expect(getCalibrationErrorMessage({ message: '' })).toBe('Unknown error');
        expect(getCalibrationErrorMessage(null)).toBe('Unknown error');
    });
});

describe('getCalibrationToastErrorMessage', () => {
    it('returns the stable see-logs message for multiline errors', () => {
        const error = 'Port open failed\nTraceback line 1\nTraceback line 2';
        expect(getCalibrationToastErrorMessage(error)).toBe(CALIBRATION_TOAST_ERROR_MESSAGE);
    });

    it('does not expose long raw error details in the toast', () => {
        const longMessage = `Calibration failed: ${'x'.repeat(500)}`;
        const formatted = getCalibrationToastErrorMessage(longMessage);
        expect(formatted).toBe(CALIBRATION_TOAST_ERROR_MESSAGE);
    });
});
