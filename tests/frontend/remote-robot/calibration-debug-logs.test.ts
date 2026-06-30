// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import { getVisibleCalibrationLogs } from '../../../src/utils/logs/calibration-debug-logs';

describe('getVisibleCalibrationLogs', () => {
    it('keeps traceback lines visible when a failure is present', () => {
        const sessionLogs = [
            '2026-06-30 12:34:22.001 [calibration] Desktop teleoperator auto calibrate stderr: Traceback (most recent call last):',
            'Desktop teleoperator auto calibrate stderr | File "auto_calibrate.py", line 87, in auto_calibrate',
            'Desktop teleoperator auto calibrate stderr | ValueError: broken calibration file',
        ];

        expect(getVisibleCalibrationLogs(sessionLogs, ['sourccey'])).toEqual(sessionLogs);
    });

    it('falls back to recent session logs when keyword filtering would hide everything', () => {
        const sessionLogs = [
            '2026-06-30 12:34:22.001 [calibration] calibration run started',
            '2026-06-30 12:34:24.001 [calibration] probing hardware',
        ];

        expect(getVisibleCalibrationLogs(sessionLogs, ['missing-context-token'])).toEqual(sessionLogs);
    });
});
