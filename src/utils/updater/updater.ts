import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { confirm, message } from '@tauri-apps/plugin-dialog';

type InstallDesktopUpdateOptions = {
    expectedVersion?: string | null;
    onLog?: (message: string) => void;
};

export type DesktopAppInstallProgress = {
    running: boolean;
    percent: number;
    logs: string[];
    error: string | null;
};

let installProgress: DesktopAppInstallProgress = { running: false, percent: 0, logs: [], error: null };
let activeInstall: Promise<boolean> | null = null;
const installProgressListeners = new Set<() => void>();

const updateInstallProgress = (update: Partial<DesktopAppInstallProgress>) => {
    installProgress = { ...installProgress, ...update };
    installProgressListeners.forEach((listener) => listener());
};

export const getDesktopAppInstallProgress = () => installProgress;
export const subscribeToDesktopAppInstallProgress = (listener: () => void) => {
    installProgressListeners.add(listener);
    return () => installProgressListeners.delete(listener);
};

const runDesktopUpdate = async (options?: InstallDesktopUpdateOptions): Promise<boolean> => {
    const log = (message: string) => {
        updateInstallProgress({ logs: [...installProgress.logs, message].slice(-2_000) });
        options?.onLog?.(message);
    };
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
                updateInstallProgress({ percent: 1 });
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
                    updateInstallProgress({ percent: Math.min(90, Math.max(1, Math.floor(percent * 0.9))) });
                    if (percent >= lastReportedPercent + 10) {
                        lastReportedPercent = percent;
                        log(`Download progress: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB).`);
                    }
                }
                return;
            }
            updateInstallProgress({ percent: 95 });
            log('Download complete. Verifying signature and installing update...');
        });
        updateInstallProgress({ percent: 100 });
        log('Update installed successfully. Relaunching Vulcan Studio...');
        await relaunch();
        return true;
    } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        updateInstallProgress({ error: errorText });
        log(`Update failed: ${errorText}`);
        await message(`Failed to install desktop update.\n\n${errorText}`, {
            title: 'Update Failed',
            kind: 'error',
        });
        return false;
    }
};

export const installAvailableDesktopUpdate = (options?: InstallDesktopUpdateOptions): Promise<boolean> => {
    if (activeInstall) return activeInstall;

    updateInstallProgress({ running: true, percent: 0, logs: [], error: null });
    activeInstall = runDesktopUpdate(options).finally(() => {
        updateInstallProgress({ running: false });
        activeInstall = null;
    });
    return activeInstall;
};
