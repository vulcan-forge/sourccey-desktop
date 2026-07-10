const { readdirSync } = require('fs');
const { join } = require('path');
const tools = require('./release-unix');

/** @param {string[]} suffixes */
function findArtifacts(suffixes) {
    if (!tools.existsSync(tools.bundleDir)) return [];
    return readdirSync(tools.bundleDir, { recursive: true })
        .filter((entry) => suffixes.some((suffix) => entry.toString().endsWith(suffix)))
        .map((entry) => join(tools.bundleDir, entry.toString()));
}

function preflight() {
    if (process.platform !== 'linux') tools.fail('The Linux release flow must run on Linux.');
    tools.requireCommand('uv', 'Install uv and ensure it is available on PATH.');
    tools.requireCommand('pkg-config', 'Install the Tauri Linux build prerequisites.');
    tools.assertUpdaterSigningEnvironment();
    console.log('[release] Linux release preflight passed.');
}

function verify() {
    const artifacts = findArtifacts(['.AppImage', '.deb', '.rpm']);
    if (!artifacts.length) tools.fail('No Linux .AppImage, .deb, or .rpm artifacts were generated.');
    for (const artifact of artifacts) console.log(`[release] Verified Linux artifact exists: ${artifact}`);
    const signatures = findArtifacts(['.sig']);
    if (!signatures.length) tools.fail('No Tauri updater signature files were generated.');
    console.log(`[release] Verified ${signatures.length} updater signature file(s).`);
}

try {
    preflight();
    if (process.argv.includes('--check')) process.exit(0);
    const cleanup = tools.stageUv();
    try { tools.runTauriBuild(); verify(); } finally { cleanup(); }
    console.log('[release] Linux release completed successfully.');
} catch (error) {
    console.error(`[release] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
