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

