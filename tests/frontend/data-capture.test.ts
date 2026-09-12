// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import { DATA_CAPTURE_ENABLED_STORAGE_KEY, getDataCaptureEnabled, setDataCaptureEnabled } from '../../src/settings/data-capture';

const createStorage = (initialValue: string | null = null) => {
    let value = initialValue;

    return {
        getItem: (key: string) => (key === DATA_CAPTURE_ENABLED_STORAGE_KEY ? value : null),
        setItem: (key: string, nextValue: string) => {
            if (key === DATA_CAPTURE_ENABLED_STORAGE_KEY) {
                value = nextValue;
            }
        },
    };
};

describe('data capture setting', () => {
    it('defaults to enabled when no preference has been saved', () => {
        expect(getDataCaptureEnabled(createStorage())).toBe(true);
    });

    it('persists and reads an opted-out preference', () => {
        const storage = createStorage();

        setDataCaptureEnabled(false, storage);

        expect(getDataCaptureEnabled(storage)).toBe(false);
    });
});
