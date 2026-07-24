const { describe, expect, test } = require('bun:test');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const {
    artifactArchitecture,
    finalizeArtifactNames,
    normalizedArtifactName,
    requestedArchitecture,
} = require('../../scripts/build/artifact-names');

const release = (architecture) => ({
    productName: 'Vulcan Studio',
    version: '0.0.20',
    architecture,
});

describe('release artifact names', () => {
    test('removes spaces from Windows NSIS artifacts and signatures', () => {
        const windows = release('x64');
        expect(normalizedArtifactName('Vulcan Studio_0.0.20_x64-setup.exe', windows)).toBe(
            'VulcanStudio_0.0.20_x64-setup.exe'
        );
        expect(normalizedArtifactName('Vulcan Studio_0.0.20_x64-setup.exe.sig', windows)).toBe(
            'VulcanStudio_0.0.20_x64-setup.exe.sig'
        );
    });

    test('removes spaces from Linux artifacts', () => {
        const linux = release('amd64');
        expect(normalizedArtifactName('Vulcan Studio_0.0.20_amd64.AppImage', linux)).toBe(
            'VulcanStudio_0.0.20_amd64.AppImage'
        );
        expect(normalizedArtifactName('Vulcan Studio_0.0.20_amd64.deb', linux)).toBe(
            'VulcanStudio_0.0.20_amd64.deb'
        );
    });

    test('adds version and architecture to the macOS updater archive', () => {
        const macos = release('aarch64');
        expect(normalizedArtifactName('Vulcan Studio.app.tar.gz', macos)).toBe(
            'VulcanStudio_0.0.20_aarch64.app.tar.gz'
        );
        expect(normalizedArtifactName('Vulcan Studio.app.tar.gz.sig', macos)).toBe(
            'VulcanStudio_0.0.20_aarch64.app.tar.gz.sig'
        );
        expect(normalizedArtifactName('Vulcan Studio_0.0.20_aarch64.dmg', macos)).toBe(
            'VulcanStudio_0.0.20_aarch64.dmg'
        );
    });

    test('does not rename application bundles or unrelated files', () => {
        const macos = release('aarch64');
        expect(normalizedArtifactName('Vulcan Studio.app', macos)).toBe('Vulcan Studio.app');
        expect(normalizedArtifactName('README.txt', macos)).toBe('README.txt');
    });

    test('maps host and target architectures to platform artifact conventions', () => {
        expect(artifactArchitecture('win32', 'x64')).toBe('x64');
        expect(artifactArchitecture('linux', 'x86_64-unknown-linux-gnu')).toBe('amd64');
        expect(artifactArchitecture('darwin', 'arm64')).toBe('aarch64');
        expect(requestedArchitecture(['build', '--target', 'aarch64-apple-darwin'])).toBe(
            'aarch64-apple-darwin'
        );
        expect(requestedArchitecture(['build', '--target=x86_64-pc-windows-msvc'])).toBe(
            'x86_64-pc-windows-msvc'
        );
    });

    test('renames generated artifacts without changing the configured product name', () => {
        const root = mkdtempSync(join(tmpdir(), 'vulcan-artifacts-'));
        const nsisDirectory = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
        const sourceName = 'Vulcan Studio_0.0.20_x64-setup.exe';
        const destinationName = 'VulcanStudio_0.0.20_x64-setup.exe';
        try {
            mkdirSync(nsisDirectory, { recursive: true });
            writeFileSync(
                join(root, 'src-tauri', 'tauri.conf.json'),
                JSON.stringify({ productName: 'Vulcan Studio', version: '0.0.20' })
            );
            writeFileSync(join(nsisDirectory, sourceName), 'installer');

            const renamed = finalizeArtifactNames({
                args: ['build', '--target=x86_64-pc-windows-msvc'],
                platform: 'win32',
                root,
            });

            expect(renamed).toEqual([join(nsisDirectory, destinationName)]);
            expect(existsSync(join(nsisDirectory, sourceName))).toBe(false);
            expect(existsSync(join(nsisDirectory, destinationName))).toBe(true);
            const config = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
            expect(config.productName).toBe('Vulcan Studio');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
