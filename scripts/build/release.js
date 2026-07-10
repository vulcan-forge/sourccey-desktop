const { spawnSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

/** @type {Partial<Record<NodeJS.Platform, 'windows' | 'macos' | 'linux'>>} */
const platformNames = { win32: 'windows', darwin: 'macos', linux: 'linux' };

/** @param {string} message */
function fail(message) {
    console.error(`[release] ${message}`);
    process.exit(1);
}

function loadReleaseEnvironment() {
    const envPath = join(process.cwd(), '.env');
    if (!existsSync(envPath)) return;
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator < 0) continue;
        const name = trimmed.slice(0, separator).trim();
        let value = trimmed.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!process.env[name]) process.env[name] = value;
    }
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
if (result.error) fail(`Failed to start ${hostPlatform} release flow: ${result.error.message}`);
process.exit(result.status ?? 1);
