const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

/**
 * Load release variables from .env without replacing variables supplied by the
 * caller. Keeping this in one place lets release commands share the same
 * signing credentials.
 *
 * @param {string} [root]
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {NodeJS.ProcessEnv}
 */
function loadReleaseEnvironment(root = process.cwd(), environment = process.env) {
    const envPath = join(root, '.env');
    if (!existsSync(envPath)) return environment;

    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator < 0) continue;
        const name = trimmed.slice(0, separator).trim();
        let value = trimmed.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!environment[name]) environment[name] = value;
    }

    return environment;
}

module.exports = { loadReleaseEnvironment };
