export type LanRobotDraft = {
    nickname: string;
    host: string;
    leftArmPort: string;
    rightArmPort: string;
};

const normalizeText = (value: string) => value.trim();

const formatNicknameSeed = (value: string) => value.padStart(3, '0');

export const normalizeLanRobotDraft = (draft: LanRobotDraft): LanRobotDraft => ({
    nickname: normalizeText(draft.nickname),
    host: normalizeText(draft.host),
    leftArmPort: normalizeText(draft.leftArmPort),
    rightArmPort: normalizeText(draft.rightArmPort),
});

export const getLanRobotValidationErrors = (draft: LanRobotDraft, existingNicknames: string[] = []) => {
    const normalized = normalizeLanRobotDraft(draft);
    const existing = new Set(existingNicknames.map((nickname) => nickname.trim().toLowerCase()).filter(Boolean));
    const errors: string[] = [];

    if (!normalized.nickname) {
        errors.push('Robot nickname is required.');
    } else if (existing.has(normalized.nickname.toLowerCase())) {
        errors.push('That robot nickname is already in use on this desktop.');
    }

    return errors;
};

export const getLanRobotNicknameSuggestion = (host: string, existingNicknames: string[] = []) => {
    const normalizedHost = normalizeText(host);
    const lastToken = normalizedHost.split('.').pop() || '1';
    const numericToken = Number.parseInt(lastToken, 10);
    const seed = Number.isFinite(numericToken) && numericToken > 0 ? formatNicknameSeed(String(numericToken)) : '001';
    const base = `sourccey-${seed}`;
    const normalizedExisting = new Set(existingNicknames.map((nickname) => nickname.trim().toLowerCase()).filter(Boolean));

    if (!normalizedExisting.has(base.toLowerCase())) {
        return base;
    }

    let suffix = 2;
    while (normalizedExisting.has(`${base}-${suffix}`.toLowerCase())) {
        suffix += 1;
    }

    return `${base}-${suffix}`;
};

export const buildLanRobotDraftFromHost = (host: string, existingNicknames: string[] = []): LanRobotDraft => ({
    nickname: getLanRobotNicknameSuggestion(host, existingNicknames),
    host: normalizeText(host),
    leftArmPort: '',
    rightArmPort: '',
});
