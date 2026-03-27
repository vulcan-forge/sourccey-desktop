// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import {
    createEmptyManualDriveSourceMap,
    getPressedManualDriveKeys,
    MANUAL_DRIVE_KEYS,
    normalizeManualDriveKey,
    pressManualDriveKeys,
    releaseManualDriveKeys,
} from '../../../src/components/Elements/RemoteRobot/manual-drive-keys';

describe('manual drive key normalization', () => {
    it('accepts only supported keys', () => {
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
});

describe('manual drive source map', () => {
    it('button press/release updates expected key set', () => {
        let state = createEmptyManualDriveSourceMap();
        state = pressManualDriveKeys(state, 'btn:n', ['w']);
        expect(getPressedManualDriveKeys(state)).toEqual(['w']);
        state = releaseManualDriveKeys(state, 'btn:n', ['w']);
        expect(getPressedManualDriveKeys(state)).toEqual([]);
    });

    it('diagonal button presses two keys together', () => {
        let state = createEmptyManualDriveSourceMap();
        state = pressManualDriveKeys(state, 'btn:nw', ['w', 'a']);
        expect(getPressedManualDriveKeys(state)).toEqual(['w', 'a']);
    });

    it('keyboard and button sources combine safely', () => {
        let state = createEmptyManualDriveSourceMap();
        state = pressManualDriveKeys(state, 'btn:n', ['w']);
        state = pressManualDriveKeys(state, 'kbd:w', ['w']);
        expect(getPressedManualDriveKeys(state)).toEqual(['w']);

        state = releaseManualDriveKeys(state, 'btn:n', ['w']);
        expect(getPressedManualDriveKeys(state)).toEqual(['w']);

        state = releaseManualDriveKeys(state, 'kbd:w', ['w']);
        expect(getPressedManualDriveKeys(state)).toEqual([]);
    });

    it('does not duplicate the same source on repeated keydown', () => {
        let state = createEmptyManualDriveSourceMap();
        state = pressManualDriveKeys(state, 'kbd:w', ['w']);
        state = pressManualDriveKeys(state, 'kbd:w', ['w']);
        expect(state.w).toEqual(['kbd:w']);
        expect(getPressedManualDriveKeys(state)).toEqual(['w']);
    });

    it('keeps stable output ordering based on MANUAL_DRIVE_KEYS', () => {
        let state = createEmptyManualDriveSourceMap();
        state = pressManualDriveKeys(state, 'btn:combo', ['x', 'a', 'q']);
        expect(getPressedManualDriveKeys(state)).toEqual(
            MANUAL_DRIVE_KEYS.filter((key) => ['x', 'a', 'q'].includes(key))
        );
    });

    it('supports speed keys in the same source map', () => {
        let state = createEmptyManualDriveSourceMap();
        state = pressManualDriveKeys(state, 'btn:speed', ['r', 'f']);
        expect(getPressedManualDriveKeys(state)).toEqual(
            MANUAL_DRIVE_KEYS.filter((key) => ['r', 'f'].includes(key))
        );
    });
});
