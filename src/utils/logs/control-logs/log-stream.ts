const ANSI_CONTROL_SEQUENCE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const REPEATED_LOG_SUFFIX = /\s\[repeated x(\d+)\]$/;

export const sanitizeLogLine = (log: string) =>
    log
        .replace(ANSI_CONTROL_SEQUENCE, '')
        .replace(/\r/g, '')
        .trim();

const filterLogs = (logs: string[]) =>
    logs.filter((log) => {
        if (!log) return false;

        const trimmedLog = sanitizeLogLine(log);
        if (trimmedLog === '') return false;

        return true;
    });

const splitRepeatedLog = (log: string) => {
    const match = log.match(REPEATED_LOG_SUFFIX);
    if (!match) {
        return { baseLog: log, repeatCount: 1 };
    }

    return {
        baseLog: log.replace(REPEATED_LOG_SUFFIX, ''),
        repeatCount: Number(match[1]) || 1,
    };
};

const formatRepeatedLog = (baseLog: string, repeatCount: number) =>
    repeatCount > 1 ? `${baseLog} [repeated x${repeatCount}]` : baseLog;

export const appendCondensedLogs = (existingLogs: string[], incomingLogs: string[], maxEntries = 100) => {
    const nextLogs = [...filterLogs(existingLogs)];

    for (const log of filterLogs(incomingLogs).map(sanitizeLogLine)) {
        const lastLog = nextLogs[nextLogs.length - 1];
        if (!lastLog) {
            nextLogs.push(log);
            continue;
        }

        const { baseLog, repeatCount } = splitRepeatedLog(lastLog);
        if (baseLog === log) {
            nextLogs[nextLogs.length - 1] = formatRepeatedLog(baseLog, repeatCount + 1);
            continue;
        }

        nextLogs.push(log);
    }

    return nextLogs.slice(-maxEntries);
};
