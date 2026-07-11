const { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const { spawnSync } = require('child_process');

function fail(message) {
    console.error(`[unsigned-macos] ${message}`);
    process.exit(1);
}

if (process.platform !== 'darwin') fail('Unsigned macOS packaging must run on macOS.');

const root = process.cwd();
const config = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const version = config.version;
const bundleRoot = join(root, 'src-tauri', 'target', 'release', 'bundle');
const macosDir = join(bundleRoot, 'macos');
const dmgDir = join(bundleRoot, 'dmg');
const app = join(macosDir, 'Vulcan Studio.app');
const updaterArchive = join(macosDir, 'Vulcan Studio.app.tar.gz');
const updaterSignature = `${updaterArchive}.sig`;
const stableArchive = join(macosDir, 'VulcanStudioInstaller.app.tar.gz');
const stableSignature = `${stableArchive}.sig`;
const dmg = join(dmgDir, 'VulcanStudioInstaller.dmg');

for (const required of [app, updaterArchive, updaterSignature]) {
    if (!existsSync(required)) fail(`Expected build artifact was not found: ${required}`);
}

mkdirSync(dmgDir, { recursive: true });
const staging = mkdtempSync(join(tmpdir(), 'vulcan-dmg-'));
try {
    cpSync(app, join(staging, 'Vulcan Studio.app'), { recursive: true });
    symlinkSync('/Applications', join(staging, 'Applications'));
    rmSync(dmg, { force: true });
    const result = spawnSync(
        'hdiutil',
        ['create', '-volname', 'Vulcan Studio', '-srcfolder', staging, '-ov', '-format', 'UDZO', dmg],
        { cwd: root, stdio: 'inherit' }
    );
    if (result.error) fail(`Failed to start hdiutil: ${result.error.message}`);
    if (result.status !== 0) fail(`hdiutil failed with exit code ${result.status}.`);
} finally {
    rmSync(staging, { recursive: true, force: true });
}

cpSync(updaterArchive, stableArchive);
cpSync(updaterSignature, stableSignature);

const manifestPath = join(root, 'public', 'latest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const baseUrl = (process.env.SOURCCEY_UPDATER_BASE_URL ||
    'https://sourccey.nyc3.cdn.digitaloceanspaces.com/updater/vulcan-studio').replace(/\/$/, '');
manifest.version = version;
manifest.date = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
manifest.platforms = manifest.platforms || {};
manifest.platforms['darwin-aarch64'] = {
    signature: readFileSync(stableSignature, 'utf8').trim(),
    url: `${baseUrl}/VulcanStudioInstaller.app.tar.gz`,
    installer_url: `${baseUrl}/VulcanStudioInstaller.dmg`,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);

console.log(`[unsigned-macos] Created unsigned DMG: ${dmg}`);
console.log(`[unsigned-macos] Prepared updater archive: ${stableArchive}`);
console.log(`[unsigned-macos] Updated manifest: ${manifestPath}`);
