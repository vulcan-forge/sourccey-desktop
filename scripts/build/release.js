const { spawnSync } = require('child_process');
const { join } = require('path');
const { loadReleaseEnvironment } = require('./release-env');

/** @type {Partial<Record<NodeJS.Platform, 'windows' | 'macos' | 'linux'>>} */
const platformNames = { win32: 'windows', darwin: 'macos', linux: 'linux' };

/** @param {string} message */
function fail(message) {
    console.error(`[release] ${message}`);
    process.exit(1);
}

loadReleaseEnvironment();
for (const name of ['TAURI_SIGNING_PRIVATE_KEY', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD']) {
    if (!process.env[name]) fail(`${name} is required for official updater artifacts.`);
}

const requestedArgument = process.argv.find((argument) => argument.startsWith('--platform='));
const requestedPlatform = requestedArgument?.split('=', 2)[1];
const hostPlatform = platformNames[process.platform];
if (!hostPlatform) fail(`Unsupported release host: ${process.platform}`);
if (requestedPlatform && !['windows', 'macos', 'linux'].includes(requestedPlatform)) {
    fail(`Unknown release platform: ${requestedPlatform}`);
}
if (requestedPlatform && requestedPlatform !== hostPlatform) {
    fail(`${requestedPlatform} releases must run natively on ${requestedPlatform}; this host is ${hostPlatform}.`);
}

const script = join(process.cwd(), 'scripts', 'build', `release-${hostPlatform}.js`);
const forwardedArguments = process.argv.slice(2).filter((argument) => !argument.startsWith('--platform='));
console.log(`[release] Selected ${hostPlatform} release flow.`);
const result = spawnSync('bun', [script, ...forwardedArguments], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
});
if (result.error instanceof Error && result.error.message) {
    fail(`Failed to start ${hostPlatform} release flow: ${result.error.message}`);
}
process.exit(result.status ?? 1);
