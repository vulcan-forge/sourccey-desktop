export type RemoteRecordDraft = {
    repoId: string;
    namePattern: string;
    numEpisodes: string;
    episodeTimeS: string;
    resetTimeS: string;
    task: string;
};

export type ParsedRecordSettings = Omit<RemoteRecordDraft, 'numEpisodes' | 'episodeTimeS' | 'resetTimeS'> & {
    numEpisodes: number;
    episodeTimeS: number;
    resetTimeS: number;
};

export function validateRecordSettings(draft: RemoteRecordDraft): {
    ready: boolean;
    message: string;
    parsed: ParsedRecordSettings | null;
} {
    const repoId = draft.repoId.trim();
    const namePattern = draft.namePattern.trim();
    const task = draft.task.trim();
    const numEpisodes = Number(draft.numEpisodes);
    const episodeTimeS = Number(draft.episodeTimeS);
    const resetTimeS = Number(draft.resetTimeS);

    const invalid = (message: string) => ({ ready: false, message, parsed: null });
    if (!repoId) return invalid('Record path is required.');
    if (!namePattern || /[\\/<>:"|?*]/.test(namePattern) || /\{(?!Task\}|number\}|timestamp\})/.test(namePattern)) {
        return invalid('Use a name with {Task}, {number}, or {timestamp}; avoid path characters.');
    }
    if (!draft.numEpisodes.trim() || !Number.isInteger(numEpisodes) || numEpisodes <= 0 || numEpisodes > 2_147_483_647) {
        return invalid('Episodes must be a whole number between 1 and 2147483647.');
    }
    if (!draft.episodeTimeS.trim() || !Number.isFinite(episodeTimeS) || episodeTimeS <= 0) {
        return invalid('Episode time must be greater than 0.');
    }
    if (!draft.resetTimeS.trim() || !Number.isFinite(resetTimeS) || resetTimeS < 0) {
        return invalid('Reset time must be 0 or greater.');
    }
    if (!task) return invalid('Task is required.');
    return { ready: true, message: '', parsed: { repoId, namePattern, task, numEpisodes, episodeTimeS, resetTimeS } };
}
