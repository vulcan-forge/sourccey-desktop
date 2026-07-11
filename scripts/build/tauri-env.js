// Tauri build wrapper:
// - Standard usage: `bun run tauri build` (or `bun run tauri:build`).
// - Previous usage: `dotenv -e .env -- tauri build`
// - What it does: loads signing keys from `.env` into the process environment
//   and warns if any are missing for build commands, then forwards all args
//   to the Tauri CLI.
// - How it works: parses `.env` locally, merges required keys into `process.env`,
//   then spawns the `tauri` binary with inherited stdio.
const { chmodSync, copyFileSync, existsSync, readFileSync, rmSync } = require('fs');
const { join } = require('path');
const { spawn, spawnSync } = require('child_process');

const REQUIRED_KEYS = ['TAURI_SIGNING_PUBLIC_KEY', 'TAURI_SIGNING_PRIVATE_KEY', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD'];
const LINUX_INOTIFY_LIMITS = {
    max_user_watches: 524288,
    max_user_instances: 1024,
};

function checkLinuxInotifyLimits() {
    if (process.platform !== 'linux') return true;

    const lowLimits = [];
    for (const [name, recommended] of Object.entries(LINUX_INOTIFY_LIMITS)) {
        const path = `/proc/sys/fs/inotify/${name}`;
        try {
            const current = Number.parseInt(readFileSync(path, 'utf8').trim(), 10);
            if (Number.isFinite(current) && current < recommended) {
                lowLimits.push(`${name}=${current} (recommended: ${recommended})`);
            }
        } catch (err) {
            console.warn(`[tauri-env] Warning: failed to read ${path}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    if (lowLimits.length === 0) return true;

    console.error('[tauri-env] Linux file-watch limits are too low for reliable Tauri development:');
    for (const limit of lowLimits) console.error(`  - ${limit}`);
    console.error('\nApply the recommended limits, then rerun this command:\n');
    console.error("  printf 'fs.inotify.max_user_watches=524288\\nfs.inotify.max_user_instances=1024\\n' | sudo tee /etc/sysctl.d/99-sourccey-inotify.conf");
    console.error('  sudo sysctl --system\n');
    return false;
}

/**
 * @param {string} contents
 * @returns {Record<string, string>}
 */
function parseDotEnv(contents) {
    /** @type {Record<string, string>} */
    const out = {};
    const lines = contents.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

const envPath = join(process.cwd(), '.env');
/** @type {Record<string, string>} */
let envFromFile = {};
if (existsSync(envPath)) {
    try {
        envFromFile = parseDotEnv(readFileSync(envPath, 'utf8'));
} catch (err) {
        console.warn(`[tauri-env] Warning: failed to read .env: ${err instanceof Error ? err.message : String(err)}`);
    }
} else {
    console.warn('[tauri-env] Warning: .env not found.');
}

const args = process.argv.slice(2);
const requiresSigningKeys = args[0] === 'build';
if (args[0] === 'dev' && !checkLinuxInotifyLimits()) {
    process.exit(1);
}
const tauriCandidates =
    process.platform === 'win32'
        ? [
              join(process.cwd(), 'node_modules', '.bin', 'tauri.exe'),
              join(process.cwd(), 'node_modules', '.bin', 'tauri.cmd'),
          ]
        : [join(process.cwd(), 'node_modules', '.bin', 'tauri')];
const bin = tauriCandidates.find(existsSync) ?? 'tauri';
for (const key of REQUIRED_KEYS) {
    if (process.env[key]) continue;
    if (envFromFile[key]) {
        process.env[key] = envFromFile[key];
    } else if (requiresSigningKeys) {
        console.warn(`[tauri-env] Warning: ${key} is not set.`);
    }
}

function stageUvForBuild() {
    if (args[0] !== 'build') return () => {};

    const executableName = process.platform === 'win32' ? 'uv.exe' : 'uv';
    const destination = join(process.cwd(), 'src-tauri', 'resources', 'uv', executableName);
    // Official release flows may have already staged a platform-specific uv.
    if (existsSync(destination)) return () => {};

    const locator = process.platform === 'win32' ? ['where.exe', ['uv.exe']] : ['which', ['uv']];
    const located = spawnSync(locator[0], locator[1], { encoding: 'utf8' });
    const source = located.status === 0 ? String(located.stdout).split(/\r?\n/, 1)[0].trim() : '';
    if (!source || !existsSync(source)) {
        console.error('[tauri-env] uv is required to build bundled application resources. Install uv and ensure it is on PATH.');
        process.exit(1);
    }

    copyFileSync(source, destination);
    if (process.platform !== 'win32') chmodSync(destination, 0o755);
    console.log(`[tauri-env] Staged ${executableName} from ${source}.`);
    return () => {
        if (existsSync(destination)) rmSync(destination);
        console.log(`[tauri-env] Removed staged ${executableName}.`);
    };
}

const cleanupStagedUv = stageUvForBuild();
let cleanedUp = false;
const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    cleanupStagedUv();
};

const effectiveArgs = [...args];
const hasBundleSelection = effectiveArgs.some(
    (argument) => argument === '--bundles' || argument.startsWith('--bundles=')
);
if (
    process.platform === 'darwin' &&
    effectiveArgs[0] === 'build' &&
    !process.env.APPLE_SIGNING_IDENTITY &&
    !hasBundleSelection
) {
    effectiveArgs.push('--bundles', 'app');
    console.log('[tauri-env] Building an unsigned macOS .app bundle; DMG creation requires the official signed release flow.');
}

const child = spawn(bin, effectiveArgs, { stdio: 'inherit', env: process.env });

child.on('exit', (code) => {
    let finalCode = code ?? 1;
    if (
        finalCode === 0 &&
        process.platform === 'darwin' &&
        effectiveArgs[0] === 'build' &&
        !process.env.APPLE_SIGNING_IDENTITY
    ) {
        const packaged = spawnSync('bun', ['scripts/build/package-unsigned-macos.js'], {
            cwd: process.cwd(),
            env: process.env,
            stdio: 'inherit',
        });
        if (packaged.error) {
            console.error(`[tauri-env] Failed to start unsigned macOS packager: ${packaged.error.message}`);
            finalCode = 1;
        } else if (packaged.status !== 0) {
            finalCode = packaged.status ?? 1;
        }
    }
    cleanup();
    process.exit(finalCode);
});

child.on('error', (error) => {
    cleanup();
    console.error(`[tauri-env] Failed to start Tauri: ${error.message}`);
    process.exit(1);
});
