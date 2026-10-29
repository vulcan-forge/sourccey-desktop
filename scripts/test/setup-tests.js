const { spawnSync } = require('child_process');
const { mkdtempSync, realpathSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { dirname, join } = require('path');

// Isolate concurrent runs and avoid reusing stale pytest directories whose
// permissions may belong to another environment or user.
const temporaryRoot = realpathSync(tmpdir());
const testDirectory = mkdtempSync(join(temporaryRoot, 'vulcan-setup-tests-'));

try {
    const result = spawnSync('uv', ['run', '--with', 'pytest', 'pytest', '-q', 'tests/setup', ...process.argv.slice(2)], {
        stdio: 'inherit',
        windowsHide: true,
        env: { ...process.env, PYTEST_DEBUG_TEMPROOT: testDirectory },
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
} finally {
    const cleanupDirectory = realpathSync(testDirectory);
    if (dirname(cleanupDirectory) !== temporaryRoot) {
        throw new Error('Refusing to clean a test directory outside the temporary root.');
    }
    rmSync(cleanupDirectory, { recursive: true, force: true });
}
