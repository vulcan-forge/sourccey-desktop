export type MotorConnectionError = {
    arm: 'left' | 'right' | null;
    missingMotorIds: number[];
};

const getArm = (message: string): MotorConnectionError['arm'] => {
    if (/robotleftarm|left[_ -]?arm/i.test(message)) return 'left';
    if (/robotrightarm|right[_ -]?arm/i.test(message)) return 'right';
    return null;
};

const parseMapIds = (value: string): number[] =>
    [...value.matchAll(/(?:^|[,\s{])([1-9]\d*)\s*:/g)].map((match) => Number(match[1]));

export const parseMotorConnectionError = (message: string): MotorConnectionError | null => {
    const isMotorCheck =
        /motor check failed|missing motor ids/i.test(message) ||
        (/expected/i.test(message) && /found/i.test(message) && /motor|ids?/i.test(message));

    if (!isMotorCheck) return null;

    const missingMotorIds = [
        ...message.matchAll(/^\s*-\s*(\d+)\s*\(expected model:/gim),
    ].map((match) => Number(match[1]));

    if (missingMotorIds.length === 0) {
        const expectedMap = message.match(/full expected motor list[^\n]*:\s*\n?\s*(\{[^}]*\})/i)?.[1];
        const foundMap = message.match(/full found motor list[^\n]*:\s*\n?\s*(\{[^}]*\})/i)?.[1];

        if (expectedMap && foundMap) {
            const foundIds = new Set(parseMapIds(foundMap));
            missingMotorIds.push(...parseMapIds(expectedMap).filter((id) => !foundIds.has(id)));
        } else {
            const expected = message.match(/expected(?: motor)? ids?[^\d{[]*([\[{][^\]}]*[\]}])/i)?.[1];
            const found = message.match(/found(?: motor)? ids?[^\d{[]*([\[{][^\]}]*[\]}])/i)?.[1];
            if (expected && found) {
                const ids = (value: string) => [...value.matchAll(/\d+/g)].map((match) => Number(match[0]));
                const foundIds = new Set(ids(found));
                missingMotorIds.push(...ids(expected).filter((id) => !foundIds.has(id)));
            }
        }
    }

    return {
        arm: getArm(message),
        missingMotorIds: [...new Set(missingMotorIds)].sort((a, b) => a - b),
    };
};

export const getMotorConnectionToastMessage = (message: string): string | null => {
    const error = parseMotorConnectionError(message);
    if (!error || error.missingMotorIds.length === 0) return null;

    const arm = error.arm ? `${error.arm} arm` : 'affected arm';
    const motorLabel = error.missingMotorIds.length === 1 ? 'Motor' : 'Motors';
    const connectionLabel = error.missingMotorIds.length === 1 ? 'is' : 'are';

    return `Check the motor wires on the ${arm}. ${motorLabel} ${error.missingMotorIds.join(', ')} ${connectionLabel} likely not connected.`;
};
