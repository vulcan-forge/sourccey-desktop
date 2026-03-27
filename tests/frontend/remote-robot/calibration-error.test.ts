// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import { getCalibrationErrorMessage } from '../../../src/components/Elements/RemoteRobot/calibration-error';

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

