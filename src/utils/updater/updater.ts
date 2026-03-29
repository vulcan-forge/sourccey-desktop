import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { confirm, message } from '@tauri-apps/plugin-dialog';

type InstallDesktopUpdateOptions = {
    expectedVersion?: string | null;
};

export const installAvailableDesktopUpdate = async (options?: InstallDesktopUpdateOptions): Promise<boolean> => {
    try {
        const update = await check();
        if (!update) {
            await message('No desktop app update is currently available.', {
                title: 'Up To Date',
                kind: 'info',
            });
            return false;
        }

        const expectedVersion = options?.expectedVersion?.trim();
        if (expectedVersion && update.version !== expectedVersion) {
            await message(
                `A newer update (${update.version}) is now available. Please click update again to install the newest version.`,
                {
                    title: 'Update Refreshed',
                    kind: 'info',
                }
            );
            return false;
        }

        const shouldForce = (update as any).force === true;
        if (!shouldForce) {
            const shouldInstall = await confirm(
                `Install desktop update ${update.version}?${update.body ? `\n\nRelease notes:\n${update.body}` : ''}`,
                'Desktop Update'
            );
            if (!shouldInstall) {
                return false;
            }
        } else {
            await message(`Required update ${update.version} will be installed now.`, {
                title: 'Update Required',
                kind: 'info',
            });
        }

        await update.downloadAndInstall();
        await relaunch();
        return true;
    } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        await message(`Failed to install desktop update.\n\n${errorText}`, {
            title: 'Update Failed',
            kind: 'error',
        });
        return false;
    }
};
