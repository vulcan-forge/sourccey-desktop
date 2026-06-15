// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import {
    formatLerobotRuntimeVersionLabel,
    getLerobotRuntimeStatusMessage,
    isLerobotRuntimeUpdateAvailable,
} from '../../src/utils/updater/lerobot-runtime';

describe('lerobot runtime updater helpers', () => {
    it('shows the navbar update state only for tagged release updates', () => {
        expect(
            isLerobotRuntimeUpdateAvailable({
                state: 'update_available',
                upToDate: false,
            })
        ).toBe(true);

        expect(
            isLerobotRuntimeUpdateAvailable({
                state: 'custom_build',
                upToDate: false,
            })
        ).toBe(false);
    });

    it('returns neutral custom-build messaging', () => {
        expect(
            getLerobotRuntimeStatusMessage({
                state: 'custom_build',
                upToDate: false,
                message: 'This runtime is on an untagged local checkout.',
            })
        ).toBe('This runtime is on an untagged local checkout.');
    });

    it('returns manifest-warning messaging for unknown release metadata', () => {
        expect(
            getLerobotRuntimeStatusMessage({
                state: 'unknown',
                upToDate: false,
                message: 'Release metadata is incomplete because latest.json is missing modules.lerobot-vulcan.tag.',
            })
        ).toBe('Release metadata is incomplete because latest.json is missing modules.lerobot-vulcan.tag.');
    });

    it('formats runtime version labels from tags and commit fallbacks', () => {
        expect(formatLerobotRuntimeVersionLabel('vulcan/0.1.4', null)).toBe('0.1.4');
        expect(formatLerobotRuntimeVersionLabel(null, 'abcdef1234567890')).toBe('abcdef1234');
    });
});
