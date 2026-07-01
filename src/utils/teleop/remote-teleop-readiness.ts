import type { DesktopTeleopCalibrationStatus } from '@/hooks/Control/desktop-calibration.hook';
import type { RemoteConfig } from '@/types/remote-config';

export type RemoteTeleopReadinessCheck = {
    key: 'host' | 'leftArm' | 'rightArm' | 'keyboard' | 'fps' | 'calibration';
    label: string;
    ready: boolean;
    detail: string;
};

export type RemoteTeleopReadiness = {
    ready: boolean;
    blockingIssues: string[];
    advisoryIssues: string[];
    checks: RemoteTeleopReadinessCheck[];
};

type RemoteTeleopReadinessOptions = {
    allowLeaderFallback?: boolean;
};

const hasValue = (value: string | null | undefined) => value?.trim().length ? true : false;

const isPositiveNumber = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0;

export const getRemoteTeleopReadiness = (
    remoteConfig?: Partial<RemoteConfig> | null,
    calibrationStatus?: Partial<DesktopTeleopCalibrationStatus> | null,
    options?: RemoteTeleopReadinessOptions
): RemoteTeleopReadiness => {
    const allowLeaderFallback = options?.allowLeaderFallback === true;
    const advisoryKeys = allowLeaderFallback ? new Set<RemoteTeleopReadinessCheck['key']>(['leftArm', 'rightArm', 'calibration']) : new Set<RemoteTeleopReadinessCheck['key']>();

    const checks: RemoteTeleopReadinessCheck[] = [
        {
            key: 'host',
            label: 'Robot Host',
            ready: hasValue(remoteConfig?.remote_ip),
            detail: hasValue(remoteConfig?.remote_ip) ? `Connecting to ${remoteConfig?.remote_ip?.trim()}` : 'Set the robot host or IP address in Config.',
        },
        {
            key: 'leftArm',
            label: 'Left Arm Port',
            ready: hasValue(remoteConfig?.left_arm_port),
            detail: hasValue(remoteConfig?.left_arm_port)
                ? `Using ${remoteConfig?.left_arm_port?.trim()}`
                : 'Set the left arm port below or in Config.',
        },
        {
            key: 'rightArm',
            label: 'Right Arm Port',
            ready: hasValue(remoteConfig?.right_arm_port),
            detail: hasValue(remoteConfig?.right_arm_port)
                ? `Using ${remoteConfig?.right_arm_port?.trim()}`
                : 'Set the right arm port below or in Config.',
        },
        {
            key: 'keyboard',
            label: 'Input Device',
            ready: hasValue(remoteConfig?.keyboard),
            detail: hasValue(remoteConfig?.keyboard) ? `Using ${remoteConfig?.keyboard?.trim()}` : 'Set the keyboard or input device in Config.',
        },
        {
            key: 'fps',
            label: 'Frame Rate',
            ready: isPositiveNumber(remoteConfig?.fps),
            detail: isPositiveNumber(remoteConfig?.fps) ? `${remoteConfig?.fps} FPS` : 'Set FPS to a value greater than 0.',
        },
        {
            key: 'calibration',
            label: 'Calibration',
            ready: calibrationStatus?.isCalibrated === true,
            detail:
                calibrationStatus?.isCalibrated === true
                    ? 'Teleoperator calibration is complete.'
                    : 'Run teleoperator calibration before starting teleoperation.',
        },
    ];

    const blockingIssues = checks
        .filter((check) => !check.ready && !advisoryKeys.has(check.key))
        .map((check) => check.detail);
    const advisoryIssues = checks
        .filter((check) => !check.ready && advisoryKeys.has(check.key))
        .map((check) => check.detail);

    return {
        ready: blockingIssues.length === 0,
        blockingIssues,
        advisoryIssues,
        checks,
    };
};

export const getRemoteTeleopBlockingMessage = (readiness: RemoteTeleopReadiness) => {
    if (readiness.ready) {
        return '';
    }

    return readiness.blockingIssues.join(' ');
};
