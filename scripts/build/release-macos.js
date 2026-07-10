const { readdirSync } = require('fs');
const { join } = require('path');
const tools = require('./release-unix');

/** @param {string} suffix */
function findArtifacts(suffix) {
    if (!tools.existsSync(tools.bundleDir)) return [];
    return readdirSync(tools.bundleDir, { recursive: true })
        .filter((entry) => entry.toString().endsWith(suffix))
        .map((entry) => join(tools.bundleDir, entry.toString()));
}

function preflight() {
    if (process.platform !== 'darwin') tools.fail('The macOS release flow must run on macOS.');
    tools.requireCommand('codesign', 'Install Xcode Command Line Tools.');
    tools.requireCommand('xcrun', 'Install Xcode Command Line Tools.');
    if (!process.env.APPLE_SIGNING_IDENTITY) tools.fail('APPLE_SIGNING_IDENTITY is required.');
    const api = process.env.APPLE_API_ISSUER && process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_PATH;
    const appleId = process.env.APPLE_ID && process.env.APPLE_PASSWORD && process.env.APPLE_TEAM_ID;
    if (!api && !appleId) tools.fail('Configure App Store Connect API credentials or Apple ID notarization credentials.');
    tools.run('security', ['find-identity', '-v', '-p', 'codesigning'], { capture: true });
    tools.assertUpdaterSigningEnvironment();
    console.log('[release] macOS signing and notarization preflight passed.');
}

function verify() {
    const apps = findArtifacts('.app');
    const dmgs = findArtifacts('.dmg');
    if (!apps.length || !dmgs.length) tools.fail('Expected both .app and .dmg release artifacts.');
    for (const app of apps) {
        tools.run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
        tools.run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
        console.log(`[release] Verified signed app: ${app}`);
    }
    for (const dmg of dmgs) {
        tools.run('xcrun', ['stapler', 'validate', dmg]);
        console.log(`[release] Verified notarization ticket: ${dmg}`);
    }
}

try {
    preflight();
    if (process.argv.includes('--check')) process.exit(0);
    const cleanup = tools.stageUv();
    try { tools.runTauriBuild(); verify(); } finally { cleanup(); }
    console.log('[release] Signed and notarized macOS release completed successfully.');
} catch (error) {
    console.error(`[release] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
