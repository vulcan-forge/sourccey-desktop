const { describe, expect, test } = require('bun:test');
const { shouldRunReleaseFlow } = require('../../scripts/build/tauri-build-routing');

describe('Tauri build routing', () => {
    test('routes normal desktop builds through the verified release flow', () => {
        expect(shouldRunReleaseFlow(['build'], {})).toBe(true);
    });

    test('lets the release flow invoke Tauri without recursion', () => {
        expect(shouldRunReleaseFlow(['build'], { VULCAN_RELEASE_BUILD: '1' })).toBe(false);
    });

    test('keeps kiosk builds on the direct unsigned build path', () => {
        expect(shouldRunReleaseFlow(['build'], { VULCAN_KIOSK_BUILD: '1' })).toBe(false);
    });

    test('does not route development commands through release builds', () => {
        expect(shouldRunReleaseFlow(['dev'], {})).toBe(false);
    });
});
