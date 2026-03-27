// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import { getCalibrationErrorMessage, getCalibrationToastErrorMessage } from '../../../src/components/Elements/RemoteRobot/calibration-error';

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
    it('uses the first line of a multi-line message', () => {
        const error = 'Port open failed\nTraceback line 1\nTraceback line 2';
        expect(getCalibrationToastErrorMessage(error)).toBe('Port open failed');
    });

    it('truncates very long messages', () => {
        const longMessage = `Calibration failed: ${'x'.repeat(500)}`;
        const formatted = getCalibrationToastErrorMessage(longMessage);
        expect(formatted.length).toBeLessThanOrEqual(160);
        expect(formatted.endsWith('...')).toBe(true);
    });
});
