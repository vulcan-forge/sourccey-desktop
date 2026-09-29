const { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const { spawnSync } = require('child_process');
const { artifactArchitecture, finalizeArtifactNames, macosUpdaterPlatform } = require('./artifact-names');

function fail(message) {
    console.error(`[macos-adhoc] ${message}`);
    process.exit(1);
}

if (process.platform !== 'darwin') fail('Ad-hoc macOS packaging must run on macOS.');

const root = process.cwd();
const config = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const version = config.version;
const architecture = artifactArchitecture(process.platform, process.arch);
const updaterPlatform = macosUpdaterPlatform(process.arch);
const artifactBaseName = `VulcanStudio_${version}_${architecture}`;
finalizeArtifactNames({ platform: process.platform, root });
const bundleRoot = join(root, 'src-tauri', 'target', 'release', 'bundle');
const macosDir = join(bundleRoot, 'macos');
const dmgDir = join(bundleRoot, 'dmg');
const app = join(macosDir, 'Vulcan Studio.app');
const updaterArchive = join(macosDir, `${artifactBaseName}.app.tar.gz`);
const updaterSignature = `${updaterArchive}.sig`;
const dmg = join(dmgDir, `${artifactBaseName}.dmg`);

for (const required of [app, updaterArchive, updaterSignature]) {
    if (!existsSync(required)) fail(`Expected build artifact was not found: ${required}`);
}

const signatureCheck = spawnSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], {
    cwd: root,
    encoding: 'utf8',
});
if (signatureCheck.error) fail(`Failed to start codesign: ${signatureCheck.error.message}`);
if (signatureCheck.status !== 0) {
    fail(`The application has an invalid code signature: ${(signatureCheck.stderr || signatureCheck.stdout).trim()}`);
}
const signatureDetails = spawnSync('codesign', ['--display', '--verbose=4', app], {
    cwd: root,
    encoding: 'utf8',
});
if (signatureDetails.error) fail(`Failed to inspect the application signature: ${signatureDetails.error.message}`);
if (signatureDetails.status !== 0) fail('Unable to inspect the application code signature.');
if (!/^Signature=adhoc$/m.test(`${signatureDetails.stdout}\n${signatureDetails.stderr}`)) {
    fail('Expected an ad-hoc signature, but the application was signed with a different identity.');
}
console.log(`[macos-adhoc] Verified ad-hoc signature: ${app}`);

mkdirSync(dmgDir, { recursive: true });
const staging = mkdtempSync(join(tmpdir(), 'vulcan-dmg-'));
try {
    cpSync(app, join(staging, 'Vulcan Studio.app'), { recursive: true });
    symlinkSync('/Applications', join(staging, 'Applications'));
    rmSync(dmg, { force: true });
    const result = spawnSync('hdiutil', ['create', '-volname', 'Vulcan Studio', '-srcfolder', staging, '-ov', '-format', 'UDZO', dmg], {
        cwd: root,
        stdio: 'inherit',
    });
    if (result.error) fail(`Failed to start hdiutil: ${result.error.message}`);
    if (result.status !== 0) fail(`hdiutil failed with exit code ${result.status}.`);
} finally {
    rmSync(staging, { recursive: true, force: true });
}

const manifestPath = join(root, 'public', 'latest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const baseUrl = (process.env.SOURCCEY_UPDATER_BASE_URL || 'https://sourccey.nyc3.cdn.digitaloceanspaces.com/updater/vulcan-studio').replace(
    /\/$/,
    ''
);
manifest.version = version;
manifest.date = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
manifest.platforms = manifest.platforms || {};
manifest.platforms[updaterPlatform] = {
    signature: readFileSync(updaterSignature, 'utf8').trim(),
    url: `${baseUrl}/${artifactBaseName}.app.tar.gz`,
    installer_url: `${baseUrl}/${artifactBaseName}.dmg`,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);

console.log(`[macos-adhoc] Created DMG containing an ad-hoc signed app: ${dmg}`);
console.log(`[macos-adhoc] Prepared updater archive: ${updaterArchive}`);
console.log(`[macos-adhoc] Updated manifest: ${manifestPath}`);
