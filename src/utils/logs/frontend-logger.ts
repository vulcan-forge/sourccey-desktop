import { invoke, isTauri } from '@tauri-apps/api/core';

type LogLevel = 'log' | 'info' | 'warn' | 'error';

const MAX_MESSAGE_LENGTH = 4000;
let initialized = false;

const truncate = (value: string) => {
    if (value.length <= MAX_MESSAGE_LENGTH) {
        return value;
    }
    return `${value.slice(0, MAX_MESSAGE_LENGTH)}...`;
};

const serializeValue = (value: unknown): string => {
    if (value instanceof Error) {
        const stack = value.stack ? `\n${value.stack}` : '';
        return `${value.name}: ${value.message}${stack}`;
    }

    if (typeof value === 'string') {
        return value;
    }

    try {
        return JSON.stringify(value);
    } catch (error) {
        return String(value ?? error);
    }
};

const formatArgs = (args: unknown[]) => truncate(args.map(serializeValue).join(' '));

const sendLog = (level: LogLevel, args: unknown[]) => {
    if (!isTauri()) {
        return;
    }

    const message = formatArgs(args);
    if (!message) {
        return;
    }

    void invoke('write_frontend_log', { level, message }).catch(() => {
        // Avoid recursive logging if the logger itself fails.
    });
};

export const initFrontendLogger = () => {
    if (initialized) {
        return;
    }
    initialized = true;

    if (typeof window === 'undefined' || !isTauri()) {
        return;
    }

    // if (process.env.NODE_ENV !== 'production') {
    //     return;
    // }

    const consoleRef = console as Record<LogLevel, (...args: unknown[]) => void>;
    (['log', 'info', 'warn', 'error'] as const).forEach((level) => {
        const original = consoleRef[level].bind(console);
        consoleRef[level] = (...args: unknown[]) => {
            original(...args);
            sendLog(level, args);
        };
    });

    window.addEventListener('error', (event) => {
        const location = event.filename ? ` ${event.filename}:${event.lineno}:${event.colno}` : '';
        const details = event.error ? ` ${serializeValue(event.error)}` : '';
        sendLog('error', [`window.error ${event.message}${location}${details}`]);
    });

    window.addEventListener('unhandledrejection', (event) => {
        sendLog('error', ['unhandledrejection', event.reason]);
    });
};
