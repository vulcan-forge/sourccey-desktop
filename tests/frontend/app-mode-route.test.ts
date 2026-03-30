// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import { getAppModeRedirectPath } from '../../src/utils/app-mode-route';

describe('getAppModeRedirectPath', () => {
    it('redirects desktop routes to kiosk routes in kiosk mode', () => {
        expect(getAppModeRedirectPath('/desktop', true)).toBe('/kiosk');
        expect(getAppModeRedirectPath('/desktop/home', true)).toBe('/kiosk/home');
        expect(getAppModeRedirectPath('/desktop/robot', true)).toBe('/kiosk/robot');
    });

    it('redirects kiosk routes to desktop routes in desktop mode', () => {
        expect(getAppModeRedirectPath('/kiosk', false)).toBe('/desktop');
        expect(getAppModeRedirectPath('/kiosk/setup', false)).toBe('/desktop/setup');
        expect(getAppModeRedirectPath('/kiosk/settings/logs', false)).toBe('/desktop/settings/logs');
    });

    it('does not redirect when route prefix already matches mode', () => {
        expect(getAppModeRedirectPath('/kiosk/home', true)).toBeNull();
        expect(getAppModeRedirectPath('/desktop/settings', false)).toBeNull();
    });

    it('normalizes trailing slash and ignores non-mode-prefixed routes', () => {
        expect(getAppModeRedirectPath('/desktop/', true)).toBe('/kiosk');
        expect(getAppModeRedirectPath('/kiosk/', false)).toBe('/desktop');
        expect(getAppModeRedirectPath('/', true)).toBeNull();
        expect(getAppModeRedirectPath('/api/module-image', true)).toBeNull();
    });
});

