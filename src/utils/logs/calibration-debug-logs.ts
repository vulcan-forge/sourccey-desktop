const CALIBRATION_KEYWORDS = [
    'calibration',
    'auto calibrate',
    'auto_calibrate',
    'teleoperator',
    'traceback',
    'exception',
    'python script failed',
    'failed',
    'error',
    'stderr',
    'stdout',
    'motor',
    'port',
    'disconnect',
    'disconnected',
    'not connected',
    'missing',
    'dxl',
];

const CALIBRATION_FAILURE_KEYWORDS = [
    'traceback',
    'exception',
    'error',
    'failed',
    'stderr',
    'jsondecodeerror',
    'runtimeerror',
    'valueerror',
];

const matchesAny = (line: string, values: string[]) => {
    const lower = line.toLowerCase();
    return values.some((value) => value.length > 0 && lower.includes(value));
};

export const getVisibleCalibrationLogs = (sessionLogs: string[], contextTokens: string[]) => {
    const recent = sessionLogs.slice(-300);
    const hasFailureLogs = recent.some((line) => matchesAny(line, CALIBRATION_FAILURE_KEYWORDS));

    if (hasFailureLogs) {
        return recent.slice(-120);
    }

    const contextMatches = recent.filter((line) => matchesAny(line, contextTokens));
    const filtered = recent.filter((line) => {
        if (contextMatches.length > 0 && matchesAny(line, contextTokens)) {
            return true;
        }

        return matchesAny(line, CALIBRATION_KEYWORDS);
    });

    if (filtered.length > 0) {
        return filtered.slice(-80);
    }

    return recent.slice(-80);
};
