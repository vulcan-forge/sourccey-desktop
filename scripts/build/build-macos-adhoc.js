const { spawnSync } = require('child_process');
const { loadReleaseEnvironment } = require('./release-env');
const tools = require('./release-unix');

function fail(message) {
    throw new Error(message);
}

function hasOption(args, name) {
    return args.includes(name) || args.some((argument) => argument.startsWith(`${name}=`));
}

function runPackager(args) {
    const result = spawnSync('bun', ['scripts/build/package-unsigned-macos.js', ...args], {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'inherit',
    });
    if (result.error) fail(`Failed to start the macOS packager: ${result.error.message}`);
    if (result.status !== 0) fail(`The macOS packager failed with exit code ${result.status ?? 'unknown'}.`);
}

try {
    if (process.platform !== 'darwin') fail('The ad-hoc macOS build must run on macOS.');

    loadReleaseEnvironment();
    tools.requireCommand('codesign', 'Install the Xcode Command Line Tools.');
    tools.requireCommand('hdiutil', 'Install the macOS disk image tools.');
    tools.requireCommand('uv', 'Install uv and ensure it is available on PATH.');
    tools.assertUpdaterSigningEnvironment();

    const args = process.argv.slice(2);
    if (hasOption(args, '--target')) {
        fail('Cross-target builds are not supported because the bundled uv binary must match the host Mac.');
    }
    if (hasOption(args, '--bundles')) {
        fail('Bundle selection is managed by this command; remove the --bundles option.');
    }
    if (args.includes('--check')) {
        console.log('[macos-adhoc] Ad-hoc macOS build preflight passed.');
        process.exit(0);
    }

    const previousIdentity = process.env.APPLE_SIGNING_IDENTITY;
    process.env.APPLE_SIGNING_IDENTITY = '-';
    let cleanupUv = () => {};
    try {
        cleanupUv = tools.stageUv();
        tools.runTauriBuild(['--bundles', 'app', ...args]);
        runPackager(args);
    } finally {
        cleanupUv();
        if (previousIdentity === undefined) delete process.env.APPLE_SIGNING_IDENTITY;
        else process.env.APPLE_SIGNING_IDENTITY = previousIdentity;
    }

    console.log('[macos-adhoc] Ad-hoc signed macOS release completed successfully.');
    console.log('[macos-adhoc] Gatekeeper will still require users to approve the app on first launch.');
} catch (error) {
    console.error(`[macos-adhoc] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
