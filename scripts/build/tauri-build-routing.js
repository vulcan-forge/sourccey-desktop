/**
 * Decide whether a Tauri command should use the verified native release flow.
 * Official release scripts and the kiosk installer set an explicit build mode
 * so their internal Tauri invocation does not recursively start a new release.
 *
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {boolean}
 */
function shouldRunReleaseFlow(args, environment = process.env) {
    if (args[0] !== 'build') return false;
    return environment.VULCAN_RELEASE_BUILD !== '1' && environment.VULCAN_KIOSK_BUILD !== '1';
}

module.exports = { shouldRunReleaseFlow };
