// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import {
    createEmptyManualDriveSourceMap,
    getPressedManualDriveKeys,
    MANUAL_DRIVE_KEYS,
    normalizeManualDriveKey,
    pressManualDriveKeys,
    releaseManualDriveKeys,
} from '../../../src/components/Elements/Robot/manual-drive-keys';

describe('manual drive keys', () => {
    it('normalizes supported keys and rejects unsupported input', () => {
        expect(normalizeManualDriveKey('w')).toBe('w');
        expect(normalizeManualDriveKey('W')).toBe('w');
        expect(normalizeManualDriveKey('  q  ')).toBe('q');
        expect(normalizeManualDriveKey('x')).toBe('x');
        expect(normalizeManualDriveKey('R')).toBe('r');
        expect(normalizeManualDriveKey(' f ')).toBe('f');
        expect(normalizeManualDriveKey('N')).toBe(null);
        expect(normalizeManualDriveKey('m')).toBe(null);
        expect(normalizeManualDriveKey('space')).toBe(null);
    });

    it('keeps a key pressed until every input source releases it', () => {
        let state = createEmptyManualDriveSourceMap();
        state = pressManualDriveKeys(state, 'btn:n', ['w']);
        state = pressManualDriveKeys(state, 'kbd:w', ['w']);
        state = pressManualDriveKeys(state, 'kbd:w', ['w']);
        expect(getPressedManualDriveKeys(state)).toEqual(['w']);
        expect(state.w).toEqual(['btn:n', 'kbd:w']);

        state = releaseManualDriveKeys(state, 'btn:n', ['w']);
        expect(getPressedManualDriveKeys(state)).toEqual(['w']);

        state = releaseManualDriveKeys(state, 'kbd:w', ['w']);
        expect(getPressedManualDriveKeys(state)).toEqual([]);
    });

    it('returns combinations in stable control order', () => {
        let state = createEmptyManualDriveSourceMap();
        state = pressManualDriveKeys(state, 'btn:combo', ['x', 'a', 'q', 'r', 'f']);
        expect(getPressedManualDriveKeys(state)).toEqual(MANUAL_DRIVE_KEYS.filter((key) => ['x', 'a', 'q', 'r', 'f'].includes(key)));
    });
});
