export const MANUAL_DRIVE_KEYS = ['w', 'a', 's', 'd', 'z', 'x', 'q', 'e'] as const;

export type ManualDriveKey = (typeof MANUAL_DRIVE_KEYS)[number];
export type ManualDriveSourceMap = Record<ManualDriveKey, string[]>;

const MANUAL_DRIVE_KEY_SET: ReadonlySet<string> = new Set(MANUAL_DRIVE_KEYS);

export const createEmptyManualDriveSourceMap = (): ManualDriveSourceMap => ({
    w: [],
    a: [],
    s: [],
    d: [],
    z: [],
    x: [],
    q: [],
    e: [],
});

export const normalizeManualDriveKey = (value: string): ManualDriveKey | null => {
    const key = value.trim().toLowerCase();
    if (!MANUAL_DRIVE_KEY_SET.has(key)) {
        return null;
    }
    return key as ManualDriveKey;
};

const uniquePush = (values: string[], value: string): string[] => {
    if (values.includes(value)) {
        return values;
    }
    return [...values, value];
};

const removeValue = (values: string[], value: string): string[] => values.filter((item) => item !== value);

export const pressManualDriveKeys = (
    current: ManualDriveSourceMap,
    sourceId: string,
    keys: ManualDriveKey[]
): ManualDriveSourceMap => {
    const next: ManualDriveSourceMap = { ...current };
    for (const key of keys) {
        next[key] = uniquePush(next[key], sourceId);
    }
    return next;
};

export const releaseManualDriveKeys = (
    current: ManualDriveSourceMap,
    sourceId: string,
    keys: ManualDriveKey[]
): ManualDriveSourceMap => {
    const next: ManualDriveSourceMap = { ...current };
    for (const key of keys) {
        next[key] = removeValue(next[key], sourceId);
    }
    return next;
};

export const getPressedManualDriveKeys = (sourceMap: ManualDriveSourceMap): ManualDriveKey[] => {
    const pressed: ManualDriveKey[] = [];
    for (const key of MANUAL_DRIVE_KEYS) {
        if (sourceMap[key].length > 0) {
            pressed.push(key);
        }
    }
    return pressed;
};

