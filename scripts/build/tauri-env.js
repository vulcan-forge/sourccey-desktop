// Tauri build wrapper:
// - Standard usage: `bun run tauri build` (or `bun run tauri:build`).
// - Previous usage: `dotenv -e .env -- tauri build`
// - What it does: loads signing keys from `.env` into the process environment
//   and warns if any are missing, then forwards all args to the Tauri CLI.
// - How it works: parses `.env` locally, merges required keys into `process.env`,
//   then spawns the `tauri` binary with inherited stdio.
const { existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { spawn } = require('child_process');

const REQUIRED_KEYS = ['TAURI_SIGNING_PUBLIC_KEY', 'TAURI_SIGNING_PRIVATE_KEY', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD'];

function parseDotEnv(contents) {
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
let envFromFile = {};
if (existsSync(envPath)) {
    try {
        envFromFile = parseDotEnv(readFileSync(envPath, 'utf8'));
    } catch (err) {
        console.warn(`[tauri-env] Warning: failed to read .env: ${err.message}`);
    }
} else {
    console.warn('[tauri-env] Warning: .env not found.');
}

for (const key of REQUIRED_KEYS) {
    if (process.env[key]) continue;
    if (envFromFile[key]) {
        process.env[key] = envFromFile[key];
    } else {
        console.warn(`[tauri-env] Warning: ${key} is not set.`);
    }
}

const args = process.argv.slice(2);
const tauriBin =
    process.platform === 'win32'
        ? join(process.cwd(), 'node_modules', '.bin', 'tauri.cmd')
        : join(process.cwd(), 'node_modules', '.bin', 'tauri');

const bin = existsSync(tauriBin) ? tauriBin : 'tauri';
const child = spawn(bin, args, { stdio: 'inherit', env: process.env });

child.on('exit', (code) => {
    process.exit(code ?? 1);
});
