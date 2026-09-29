const { describe, expect, test } = require('bun:test');
const { mkdtempSync, rmSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const { loadReleaseEnvironment } = require('../../scripts/build/release-env');

describe('release environment', () => {
    test('loads quoted values and preserves variables supplied by the caller', () => {
        const root = mkdtempSync(join(tmpdir(), 'vulcan-release-env-'));
        try {
            writeFileSync(
                join(root, '.env'),
                '# release settings\nTAURI_SIGNING_PRIVATE_KEY="from file"\nAPPLE_SIGNING_IDENTITY=file identity\n'
            );
            const environment = { APPLE_SIGNING_IDENTITY: '-' };

            loadReleaseEnvironment(root, environment);

            expect(environment.TAURI_SIGNING_PRIVATE_KEY).toBe('from file');
            expect(environment.APPLE_SIGNING_IDENTITY).toBe('-');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
