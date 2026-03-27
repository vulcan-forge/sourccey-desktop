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

const MAX_TOAST_ERROR_CHARS = 160;

export const getCalibrationToastErrorMessage = (error: unknown): string => {
    const raw = getCalibrationErrorMessage(error);
    const firstLine = raw.split(/\r?\n/, 1)[0]?.trim() || 'Unknown error';
    const compact = firstLine.replace(/\s+/g, ' ').trim();
    if (compact.length <= MAX_TOAST_ERROR_CHARS) {
        return compact;
    }
    return `${compact.slice(0, MAX_TOAST_ERROR_CHARS - 3)}...`;
};
