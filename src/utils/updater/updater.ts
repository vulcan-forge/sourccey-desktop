import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { message, confirm } from '@tauri-apps/plugin-dialog';

export const checkForUpdates = async () => {
    try {
        console.info('📡 Calling check() function...', 'Update Check');
        const update = await check();
        console.info('Update check result:', update);
        console.info(`📡 Update check result: ${JSON.stringify(update, null, 2)}`, 'Update Check');

        if (update) {
            console.info(`✅ Update to ${update.version} available!\nCurrent: ${update.currentVersion}`, 'Update Found');

            // Check if this update should be forced
            const shouldForce = (update as any).force === true;
            if (shouldForce) {
                // Forced update in kiosk mode - inform and install
                await message(`Required Update: ${update.version}\n\nThis update will be installed automatically.\n\n${update.body}`, {
                    title: 'Update Required',
                    kind: 'info',
                });

                console.info('⬇️ Starting required update download...', 'Downloading');
                await update.downloadAndInstall();
                console.info('✅ Download complete! Restarting...', 'Complete');
                await relaunch();
            } else {
                // Optional update - user choice
                const shouldUpdate = await confirm(
                    `Update available: ${update.version}\n\nRelease notes:\n${update.body}\n\nWould you like to update now?`,
                    'Update Available'
                );

                if (shouldUpdate) {
                    console.info('⬇️ Starting download...', 'Downloading');
                    await update.downloadAndInstall();
                    console.info('✅ Download complete! Restarting...', 'Complete');
                    await relaunch();
                } else {
                    console.info('❌ Update declined by user', 'Update Declined');
                }
            }
        } else {
            console.info('ℹ️ No updates available - already on latest version', 'No Updates');
        }
    } catch (error: unknown) {
        console.info(`❌ Update check failed: ${error instanceof Error ? error.message : String(error)}`, 'Error');
    }
};
