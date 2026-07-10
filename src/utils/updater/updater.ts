import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { confirm, message } from '@tauri-apps/plugin-dialog';

type InstallDesktopUpdateOptions = {
    expectedVersion?: string | null;
    onLog?: (message: string) => void;
};

export const installAvailableDesktopUpdate = async (options?: InstallDesktopUpdateOptions): Promise<boolean> => {
    const log = (message: string) => options?.onLog?.(message);
    try {
        log('Checking the configured updater endpoint...');
        const update = await check();
        if (!update) {
            log('No desktop app update is available.');
            await message('No desktop app update is currently available.', {
                title: 'Up To Date',
                kind: 'info',
            });
            return false;
        }

        const expectedVersion = options?.expectedVersion?.trim();
        log(`Updater found version ${update.version} (currently ${update.currentVersion}).`);
        if (expectedVersion && update.version !== expectedVersion) {
            log(`Update metadata changed from ${expectedVersion} to ${update.version}; installation was stopped.`);
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
                log('Update cancelled by the user.');
                return false;
            }
        } else {
            await message(`Required update ${update.version} will be installed now.`, {
                title: 'Update Required',
                kind: 'info',
            });
        }

        let downloadedBytes = 0;
        let contentLength: number | undefined;
        let lastReportedPercent = -10;
        await update.downloadAndInstall((event) => {
            if (event.event === 'Started') {
                contentLength = event.data.contentLength;
                log(
                    contentLength
                        ? `Downloading ${update.version} (${(contentLength / 1024 / 1024).toFixed(1)} MB)...`
                        : `Downloading ${update.version}...`
                );
                return;
            }
            if (event.event === 'Progress') {
                downloadedBytes += event.data.chunkLength;
                if (contentLength) {
                    const percent = Math.min(100, Math.floor((downloadedBytes / contentLength) * 100));
                    if (percent >= lastReportedPercent + 10) {
                        lastReportedPercent = percent;
                        log(`Download progress: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB).`);
                    }
                }
                return;
            }
            log('Download complete. Verifying signature and installing update...');
        });
        log('Update installed successfully. Relaunching Vulcan Studio...');
        await relaunch();
        return true;
    } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        log(`Update failed: ${errorText}`);
        await message(`Failed to install desktop update.\n\n${errorText}`, {
            title: 'Update Failed',
            kind: 'error',
        });
        return false;
    }
};
