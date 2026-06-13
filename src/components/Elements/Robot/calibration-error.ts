export const getCalibrationErrorMessage = (error: unknown): string => {
    if (typeof error === 'string') {
        const message = error.trim();
        return message.length > 0 ? message : 'Unknown error';
    }

    if (error && typeof error === 'object') {
        const maybeMessage = (error as { message?: unknown }).message;
        if (typeof maybeMessage === 'string') {
            const message = maybeMessage.trim();
            return message.length > 0 ? message : 'Unknown error';
        }
    }

    return 'Unknown error';
};

const MAX_TOAST_ERROR_CHARS = 480;

export const getCalibrationToastErrorMessage = (error: unknown): string => {
    const raw = getCalibrationErrorMessage(error);
    const compact = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join('\n');
    if (compact.length <= MAX_TOAST_ERROR_CHARS) {
        return compact;
    }
    return `${compact.slice(0, MAX_TOAST_ERROR_CHARS - 3)}...`;
};
