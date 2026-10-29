const { describe, expect, test } = require('bun:test');
import { validateRecordSettings, type RemoteRecordDraft } from '../../src/utils/teleop/remote-record-settings';

const valid: RemoteRecordDraft = {
    repoId: 'local/demo', namePattern: 'Demo-{Task}-{number}-{timestamp}',
    numEpisodes: '3', episodeTimeS: '30', resetTimeS: '15', task: 'Fold the shirt',
};

describe('recording settings validation', () => {
    test('parses valid settings and permits a zero reset interval', () => {
        expect(validateRecordSettings({ ...valid, resetTimeS: '0' }).parsed).toEqual({
            repoId: 'local/demo', namePattern: valid.namePattern, task: valid.task,
            numEpisodes: 3, episodeTimeS: 30, resetTimeS: 0,
        });
    });

    test('invalid edits clear the parsed settings instead of keeping the last valid draft', () => {
        expect(validateRecordSettings(valid).ready).toBe(true);
        const invalidEdits: Partial<RemoteRecordDraft>[] = [
            { task: ' ' }, { repoId: '' }, { namePattern: '../bad' }, { namePattern: '{unknown}' },
            { numEpisodes: '' }, { numEpisodes: '0' }, { numEpisodes: '1.5' }, { numEpisodes: '2147483648' },
            { episodeTimeS: '' }, { episodeTimeS: 'NaN' }, { episodeTimeS: '-1' },
            { resetTimeS: '' }, { resetTimeS: '-1' }, { resetTimeS: 'Infinity' },
        ];
        for (const edit of invalidEdits) {
            expect(validateRecordSettings({ ...valid, ...edit })).toMatchObject({ ready: false, parsed: null });
        }
    });
});
