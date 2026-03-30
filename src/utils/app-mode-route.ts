const DESKTOP_PREFIX = '/desktop';
const KIOSK_PREFIX = '/kiosk';

const normalizePathname = (pathname?: string | null): string => {
    if (!pathname) {
        return '/';
    }
    if (pathname.length > 1 && pathname.endsWith('/')) {
        return pathname.slice(0, -1);
    }
    return pathname;
};

const mapPrefix = (pathname: string, fromPrefix: string, toPrefix: string): string => {
    const suffix = pathname.slice(fromPrefix.length);
    if (!suffix) {
        return toPrefix;
    }
    return `${toPrefix}${suffix}`;
};

export const getAppModeRedirectPath = (pathname: string | null | undefined, isKioskMode: boolean): string | null => {
    const normalizedPath = normalizePathname(pathname);

    if (isKioskMode && normalizedPath.startsWith(DESKTOP_PREFIX)) {
        return mapPrefix(normalizedPath, DESKTOP_PREFIX, KIOSK_PREFIX);
    }

    if (!isKioskMode && normalizedPath.startsWith(KIOSK_PREFIX)) {
        return mapPrefix(normalizedPath, KIOSK_PREFIX, DESKTOP_PREFIX);
    }

    return null;
};

