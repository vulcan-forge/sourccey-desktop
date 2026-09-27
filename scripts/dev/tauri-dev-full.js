const { existsSync } = require('fs');
const { join } = require('path');
const { spawn, spawnSync } = require('child_process');

const root = process.cwd();
const extraTauriArgs = process.argv.slice(2);

if (extraTauriArgs.includes('--help') || extraTauriArgs.includes('-h')) {
    console.log(`Usage: bun tauri:dev:full [Tauri dev arguments]

Builds and starts sourccey-sync, then starts Tauri development. Stopping either
process stops the other one.`);
    process.exit(0);
}

const build = spawnSync(
    'cargo',
    ['build', '--manifest-path', 'crates/Cargo.toml', '-p', 'sourccey-sync'],
    { cwd: root, env: process.env, stdio: 'inherit' }
);

if (build.error) {
    console.error(`[dev-full] Failed to start the sourccey-sync build: ${build.error.message}`);
    process.exit(1);
}
if (build.status !== 0) process.exit(build.status ?? 1);

const syncExecutable = join(
    root,
    'crates',
    'target',
    'debug',
    process.platform === 'win32' ? 'sourccey-sync.exe' : 'sourccey-sync'
);
if (!existsSync(syncExecutable)) {
    console.error(`[dev-full] Built sync executable was not found at ${syncExecutable}`);
    process.exit(1);
}

console.log('[dev-full] Starting sourccey-sync...');
const sync = spawn(syncExecutable, ['run'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
});

console.log('[dev-full] Starting Tauri development...');
const tauri = spawn('bun', ['scripts/build/tauri-env.js', 'dev', ...extraTauriArgs], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
});

let stopping = false;

function stopProcess(child) {
    if (!child.pid || child.exitCode !== null) return;
    if (process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
        child.kill('SIGTERM');
    }
}

function finish(source, code) {
    if (stopping) return;
    stopping = true;
    console.log(`[dev-full] ${source} stopped; shutting down the development stack...`);
    stopProcess(sync);
    stopProcess(tauri);
    process.exit(code ?? 1);
}

sync.on('error', (error) => {
    console.error(`[dev-full] Failed to start sourccey-sync: ${error.message}`);
    finish('sourccey-sync', 1);
});
tauri.on('error', (error) => {
    console.error(`[dev-full] Failed to start Tauri: ${error.message}`);
    finish('Tauri', 1);
});
sync.on('exit', (code) => finish('sourccey-sync', code));
tauri.on('exit', (code) => finish('Tauri', code));

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => finish('development command', 0));
}
