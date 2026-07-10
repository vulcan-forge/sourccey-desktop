// Windows release implementation, dispatched by release.js.
const { existsSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const CERTIFICATE_THUMBPRINT = '41EFFF5C45CBB897FDB8B774AB55C578E6A39CF9';
const EXPECTED_SUBJECT = 'Vulcan Robotics, Inc.';
const bundleDir = join(process.cwd(), 'src-tauri', 'target', 'release', 'bundle');

/** @param {string} message */
function fail(message) {
    console.error(`[release] ${message}`);
    process.exit(1);
}

/** @param {string} script */
function runPowerShell(script) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        cwd: process.cwd(),
        encoding: 'utf8',
        windowsHide: true,
    });
    if (result.error) {
        fail(`Failed to start PowerShell: ${result.error.message}`);
    }
    if (result.status !== 0) {
        fail((result.stderr || result.stdout || 'PowerShell command failed.').trim());
    }
    return result.stdout.trim();
}

function assertWindowsCertificate() {
    const output = runPowerShell(`
        $thumbprint = '${CERTIFICATE_THUMBPRINT}'
        $certificate = Get-ChildItem -Path Cert:\\CurrentUser\\My, Cert:\\LocalMachine\\My -ErrorAction SilentlyContinue |
            Where-Object { $_.Thumbprint -eq $thumbprint } |
            Select-Object -First 1
        if (-not $certificate) { throw 'Sectigo EV certificate was not found. Connect the SafeNet USB token and try again.' }
        if (-not $certificate.HasPrivateKey) { throw 'Sectigo EV certificate is present, but its private key is unavailable. Unlock the SafeNet token.' }
        if ($certificate.NotAfter -le (Get-Date)) { throw 'Sectigo EV certificate has expired.' }
        [PSCustomObject]@{
            Subject = $certificate.Subject
            Issuer = $certificate.Issuer
            Thumbprint = $certificate.Thumbprint
            NotAfter = $certificate.NotAfter.ToString('o')
            HasPrivateKey = $certificate.HasPrivateKey
        } | ConvertTo-Json -Compress
    `);
    const certificate = JSON.parse(output);
    if (!certificate.Subject.includes(EXPECTED_SUBJECT)) {
        fail(`Certificate subject does not match ${EXPECTED_SUBJECT}: ${certificate.Subject}`);
    }
    if (!certificate.Issuer.includes('Sectigo')) {
        fail(`Certificate issuer is not Sectigo: ${certificate.Issuer}`);
    }
    console.log(`[release] Certificate: ${certificate.Subject}`);
    console.log(`[release] Thumbprint: ${certificate.Thumbprint}`);
    console.log(`[release] Valid until: ${certificate.NotAfter}`);
}

function runTauriBuild() {
    console.log('[release] Starting signed Tauri release build. SafeNet may request the token PIN.');
    const result = spawnSync('bun', ['scripts/build/tauri-env.js', 'build'], {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });
    if (result.error) {
        fail(`Failed to start Tauri build: ${result.error.message}`);
    }
    if (result.status !== 0) {
        fail(`Tauri build failed with exit code ${result.status ?? 'unknown'}.`);
    }
}

function verifyArtifacts() {
    if (!existsSync(bundleDir)) {
        fail(`Tauri bundle directory was not created: ${bundleDir}`);
    }
    const escapedBundleDir = bundleDir.replaceAll("'", "''");
    const output = runPowerShell(`
        $files = Get-ChildItem -LiteralPath '${escapedBundleDir}' -Recurse -File |
            Where-Object { $_.Extension -in '.exe', '.msi' }
        if (-not $files) { throw 'No Windows executable or installer artifacts were found.' }
        $results = $files | ForEach-Object {
            $signature = Get-AuthenticodeSignature -LiteralPath $_.FullName
            [PSCustomObject]@{
                Path = $_.FullName
                Status = $signature.Status.ToString()
                StatusMessage = $signature.StatusMessage
                Thumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { $null }
                Subject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
            }
        }
        $results | ConvertTo-Json -Compress
    `);
    const parsed = JSON.parse(output);
    const results = Array.isArray(parsed) ? parsed : [parsed];
    const failures = results.filter(
        (artifact) => artifact.Status !== 'Valid' || artifact.Thumbprint !== CERTIFICATE_THUMBPRINT
    );
    for (const artifact of results) {
        console.log(`[release] ${artifact.Status}: ${artifact.Path}`);
    }
    if (failures.length > 0) {
        for (const artifact of failures) {
            console.error(
                `[release] Invalid signature: ${artifact.Path}\n` +
                    `  Status: ${artifact.Status}\n` +
                    `  Signer: ${artifact.Subject ?? 'none'}\n` +
                    `  Thumbprint: ${artifact.Thumbprint ?? 'none'}\n` +
                    `  Details: ${artifact.StatusMessage ?? 'none'}`
            );
        }
        fail(`${failures.length} release artifact(s) failed Authenticode verification.`);
    }
    console.log(`[release] Verified ${results.length} signed Windows artifact(s).`);
}

if (process.platform !== 'win32') {
    fail('The signed Windows release command must run on Windows.');
}

assertWindowsCertificate();
if (process.argv.includes('--check')) {
    console.log('[release] Windows signing preflight passed.');
    process.exit(0);
}
runTauriBuild();
verifyArtifacts();
console.log('[release] Signed Windows release build completed successfully.');
