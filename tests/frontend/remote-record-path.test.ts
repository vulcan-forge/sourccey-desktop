// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import {
    buildDefaultRecordPath,
    isGeneratedRecordPath,
} from '../../src/utils/teleop/remote-record-path';

describe('remote record path', () => {
    it('uses the Vulcan Studio namespace followed by the robot name', () => {
        expect(buildDefaultRecordPath('Sourccey Robot 12', 'ignored-nickname')).toBe(
            'vulcan-studio/sourccey-robot-12'
        );
    });

    it('falls back to the nickname and then the default robot name', () => {
        expect(buildDefaultRecordPath('', '@sourccey-012')).toBe('vulcan-studio/sourccey-012');
        expect(buildDefaultRecordPath()).toBe('vulcan-studio/sourccey');
    });

    it('recognizes current and legacy generated paths without matching custom namespaces', () => {
        expect(isGeneratedRecordPath('vulcan-studio/sourccey-012')).toBe(true);
        expect(isGeneratedRecordPath('local/sourccey-012')).toBe(true);
        expect(isGeneratedRecordPath('my-team/sourccey-012')).toBe(false);
    });
});
