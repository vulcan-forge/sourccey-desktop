const { copyFileSync, existsSync, rmSync, chmodSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const bundleDir = join(process.cwd(), 'src-tauri', 'target', 'release', 'bundle');
const bundledUv = join(process.cwd(), 'src-tauri', 'resources', 'uv', 'uv');

/** @param {string} message */
function fail(message) {
    throw new Error(message);
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ capture?: boolean }} [options]
 * @returns {string}
 */
function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: process.cwd(), env: process.env,
        encoding: options.capture ? 'utf8' : undefined,
        stdio: options.capture ? 'pipe' : 'inherit',
    });
    if (result.error) fail(`Failed to start ${command}: ${result.error.message}`);
    if (result.status !== 0) {
        const details = options.capture ? String(result.stderr || result.stdout || '').trim() : '';
        fail(`${command} failed with exit code ${result.status}.${details ? ` ${details}` : ''}`);
    }
    return options.capture ? String(result.stdout).trim() : '';
}

/**
 * @param {string} command
 * @param {string} help
 * @returns {string}
 */
function requireCommand(command, help) {
    const result = spawnSync('sh', ['-lc', `command -v "${command}"`], { encoding: 'utf8' });
    if (result.status !== 0 || !result.stdout.trim()) fail(`${command} is required. ${help}`);
    return result.stdout.trim();
}

function assertUpdaterSigningEnvironment() {
    for (const name of ['TAURI_SIGNING_PRIVATE_KEY', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD']) {
        if (!process.env[name]) fail(`${name} is required for release updater artifacts.`);
    }
}

function stageUv() {
    const uvSource = requireCommand('uv', 'Install uv and ensure it is available on PATH.');
    if (existsSync(bundledUv)) fail(`Refusing to overwrite existing staged uv resource: ${bundledUv}`);
    copyFileSync(uvSource, bundledUv);
    chmodSync(bundledUv, 0o755);
    console.log(`[release] Staged native uv resource from ${uvSource}.`);
    return () => { if (existsSync(bundledUv)) rmSync(bundledUv); };
}

function runTauriBuild() {
    run('bun', ['scripts/build/tauri-env.js', 'build']);
}

module.exports = { assertUpdaterSigningEnvironment, bundleDir, existsSync, fail, requireCommand, run, runTauriBuild, stageUv };
