import type { LerobotUpdateStatus } from '@/hooks/System/lerobot-update.hook';

export const isLerobotRuntimeUpdateAvailable = (status?: LerobotUpdateStatus | null) =>
    status?.state === 'update_available';

export const getLerobotRuntimeStatusMessage = (
    status?: LerobotUpdateStatus | null,
    isLoading = false
) => {
    if (isLoading) {
        return 'Checking lerobot-vulcan runtime release status...';
    }

    if (!status) {
        return 'lerobot-vulcan runtime release status is unavailable.';
    }

    if (status.message?.trim()) {
        return status.message.trim();
    }

    switch (status.state) {
        case 'update_available':
            return 'A newer lerobot-vulcan runtime release tag is available.';
        case 'custom_build':
            return 'This runtime is on an untagged local checkout.';
        case 'unknown':
            return 'lerobot-vulcan runtime release metadata is unavailable.';
        default:
            return 'Your lerobot-vulcan runtime is on the latest released tag.';
    }
};

export const formatLerobotRuntimeVersionLabel = (tag?: string | null, commit?: string | null) => {
    if (tag && tag.trim().length > 0) {
        return tag.trim().replace(/^vulcan\//, '').replace(/^kiosk\//, '');
    }
    if (commit && commit.trim().length > 0) {
        return commit.slice(0, 10);
    }
    return 'unknown';
};
