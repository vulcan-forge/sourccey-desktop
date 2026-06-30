// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import {
    buildLanRobotDraftFromHost,
    getLanRobotNicknameSuggestion,
    getLanRobotValidationErrors,
    normalizeLanRobotDraft,
} from '../../src/utils/robots/lan-robot';

describe('LAN robot draft helpers', () => {
    it('normalizes whitespace around LAN robot fields', () => {
        expect(
            normalizeLanRobotDraft({
                nickname: '  sourccey-001  ',
                host: ' 192.168.1.50 ',
                leftArmPort: ' COM3 ',
                rightArmPort: ' COM8 ',
            })
        ).toEqual({
            nickname: 'sourccey-001',
            host: '192.168.1.50',
            leftArmPort: 'COM3',
            rightArmPort: 'COM8',
        });
    });

    it('suggests a stable nickname from a discovered host', () => {
        expect(getLanRobotNicknameSuggestion('192.168.1.50')).toBe('sourccey-050');
        expect(getLanRobotNicknameSuggestion('192.168.1.50', ['sourccey-050'])).toBe('sourccey-050-2');
    });

    it('builds a ready-to-edit draft from a discovered host', () => {
        expect(buildLanRobotDraftFromHost(' 192.168.1.77 ', ['sourccey-077'])).toEqual({
            nickname: 'sourccey-077-2',
            host: '192.168.1.77',
            leftArmPort: 'COM3',
            rightArmPort: 'COM8',
        });
    });
});
