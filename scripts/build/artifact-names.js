const { existsSync, readFileSync, readdirSync, renameSync, rmSync } = require('fs');
const { basename, dirname, join } = require('path');

const PUBLISHABLE_ARTIFACT = /(?:\.exe|\.AppImage|\.deb|\.rpm|\.dmg|\.app\.tar\.gz)(?:\.sig)?$/;

/**
 * @param {NodeJS.Platform} platform
 * @param {string} architecture
 * @returns {string}
 */
function artifactArchitecture(platform, architecture) {
    const normalized = architecture.toLowerCase();
    const arm64 = normalized.includes('aarch64') || normalized.includes('arm64');
    if (platform === 'linux') return arm64 ? 'aarch64' : 'amd64';
    if (platform === 'darwin') return arm64 ? 'aarch64' : 'x64';
    return arm64 ? 'arm64' : 'x64';
}

/**
 * @param {string[]} args
 * @returns {string}
 */
function requestedArchitecture(args) {
    const inlineTarget = args.find((argument) => argument.startsWith('--target='));
    if (inlineTarget) return inlineTarget.slice('--target='.length);
    const targetIndex = args.indexOf('--target');
    if (targetIndex >= 0 && args[targetIndex + 1]) return args[targetIndex + 1];
    return process.arch;
}

/**
 * @param {string} fileName
 * @param {{ productName: string, version: string, architecture: string }} release
 * @returns {string}
 */
function normalizedArtifactName(fileName, release) {
    if (!PUBLISHABLE_ARTIFACT.test(fileName)) return fileName;

    const compactProductName = release.productName.replace(/\s+/g, '');
    const macUpdaterArchive = `${release.productName}.app.tar.gz`;
    const macUpdaterSignature = `${macUpdaterArchive}.sig`;
    if (fileName === macUpdaterArchive || fileName === macUpdaterSignature) {
        const suffix = fileName.endsWith('.sig') ? '.app.tar.gz.sig' : '.app.tar.gz';
        return `${compactProductName}_${release.version}_${release.architecture}${suffix}`;
    }

    if (!fileName.startsWith(release.productName)) return fileName;
    return `${compactProductName}${fileName.slice(release.productName.length)}`;
}

/**
 * Recursively collects files without following directory symlinks.
 * @param {string} directory
 * @returns {string[]}
 */
function collectFiles(directory) {
    if (!existsSync(directory)) return [];
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...collectFiles(path));
        else if (entry.isFile()) files.push(path);
    }
    return files;
}

/**
 * Renames Tauri's publishable bundle artifacts while preserving the configured
 * product name used inside installers and application bundles.
 * @param {{ args?: string[], platform?: NodeJS.Platform, root?: string }} [options]
 * @returns {string[]}
 */
function finalizeArtifactNames(options = {}) {
    const root = options.root ?? process.cwd();
    const platform = options.platform ?? process.platform;
    const args = options.args ?? [];
    const config = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    const release = {
        productName: config.productName,
        version: config.version,
        architecture: artifactArchitecture(platform, requestedArchitecture(args)),
    };
    const bundleDirectory = join(root, 'src-tauri', 'target', 'release', 'bundle');
    const renamed = [];

    for (const source of collectFiles(bundleDirectory)) {
        const sourceName = basename(source);
        const destinationName = normalizedArtifactName(sourceName, release);
        if (sourceName === destinationName) continue;
        const destination = join(dirname(source), destinationName);
        if (existsSync(destination)) rmSync(destination, { force: true });
        renameSync(source, destination);
        renamed.push(destination);
        console.log(`[artifacts] Renamed ${sourceName} -> ${destinationName}`);
    }

    return renamed;
}

module.exports = {
    artifactArchitecture,
    finalizeArtifactNames,
    normalizedArtifactName,
    requestedArchitecture,
};
