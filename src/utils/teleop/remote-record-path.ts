export const DEFAULT_RECORD_NAMESPACE = 'vulcan-studio';

export const buildDefaultRecordPath = (robotName?: unknown, nickname?: unknown): string => {
    const baseName = robotName || nickname || 'sourccey';
    const slug = String(baseName)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return `${DEFAULT_RECORD_NAMESPACE}/${slug || 'sourccey'}`;
};

export const isGeneratedRecordPath = (recordPath: string): boolean => {
    return recordPath.startsWith(`${DEFAULT_RECORD_NAMESPACE}/`) || recordPath.startsWith('local/');
};
