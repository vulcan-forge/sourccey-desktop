const { describe, expect, test } = require('bun:test');
const { existsSync, readFileSync } = require('fs');
const { resolve } = require('path');

const tauriDir = resolve(__dirname, '../../src-tauri');
const base = JSON.parse(readFileSync(resolve(tauriDir, 'tauri.conf.json'), 'utf8'));
const windows = JSON.parse(readFileSync(resolve(tauriDir, 'tauri.windows.conf.json'), 'utf8'));

describe('Windows recording resources', () => {
    test('packages the recording adapters and their local imports at the runtime paths', () => {
        // A Windows resource array replaces the shared resource map entirely.
        const resources = windows.bundle.resources ?? base.bundle.resources;
        for (const filename of [
            '__init__.py',
            'runner.py',
            'standard_runner.py',
            'naming.py',
            'teleoperator.py',
            'vulcan_vr.proto',
            'vulcan_vr_pb2.py',
        ]) {
            const source = `../scripts/vr_recording/${filename}`;
            expect(resources[source]).toBe(`scripts/vr_recording/${filename}`);
            expect(existsSync(resolve(tauriDir, source))).toBe(true);
        }
        expect(resources['resources/uv/uv.exe']).toBe('resources/uv/uv.exe');
    });
});
