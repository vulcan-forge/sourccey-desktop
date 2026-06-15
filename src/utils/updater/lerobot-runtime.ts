import type { LerobotUpdateStatus } from '@/hooks/System/lerobot-update.hook';

export const isLerobotRuntimeUpdateAvailable = (status?: LerobotUpdateStatus | null) =>
    status?.state === 'update_available';

export const getLerobotRuntimeStatusMessage = (
    status?: LerobotUpdateStatus | null,
    isLoading = false
) => {
    if (isLoading) {
        return 'Checking LeRobot release status...';
    }

    if (!status) {
        return 'LeRobot release status is unavailable.';
    }

    if (status.message?.trim()) {
        return status.message.trim();
    }

    switch (status.state) {
        case 'update_available':
            return 'A newer LeRobot release tag is available.';
        case 'custom_build':
            return 'This runtime is on an untagged local checkout.';
        case 'unknown':
            return 'LeRobot release metadata is unavailable.';
        default:
            return 'Your LeRobot runtime is on the latest released tag.';
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
