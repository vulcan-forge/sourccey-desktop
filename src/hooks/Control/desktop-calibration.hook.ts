import { invoke, isTauri } from '@tauri-apps/api/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/hooks/default';

export const DESKTOP_TELEOP_CALIBRATION_KEY = (nickname: string, teleopType: string) => ['desktop-teleop-calibration', nickname, teleopType];
export const DEFAULT_DESKTOP_TELEOP_TYPE = 'bi_sourccey_leader';

export type DesktopTeleopCalibrationStatus = {
    isCalibrated: boolean;
    leftCalibrated: boolean;
    rightCalibrated: boolean;
    modifiedAt?: number | null;
    calibrationPath?: string | null;
};

export type DesktopTeleopCalibrationConfig = {
    nickname: string;
    teleopType: string;
};

export type DesktopTeleopAutoCalibrateConfig = {
    nickname: string;
    teleopType: string;
    leftArmPort: string;
    rightArmPort: string;
    fullReset: boolean;
};

const normalizeNickname = (nickname: string) => nickname.trim().replace(/^@+/, '');

export const getDesktopTeleopCalibrationStatus = async (
    config: DesktopTeleopCalibrationConfig
): Promise<DesktopTeleopCalibrationStatus> => {
    if (!isTauri()) {
        return {
            isCalibrated: true,
            leftCalibrated: true,
            rightCalibrated: true,
            modifiedAt: null,
            calibrationPath: null,
        };
    }

    return await invoke<DesktopTeleopCalibrationStatus>('desktop_get_teleop_calibration_status', {
        config: {
            nickname: normalizeNickname(config.nickname),
            teleop_type: config.teleopType,
        },
    });
};

export const runDesktopTeleopAutoCalibrate = async (
    config: DesktopTeleopAutoCalibrateConfig
): Promise<void> => {
    if (!isTauri()) return;

    await invoke('desktop_auto_calibrate_teleoperator', {
        config: {
            nickname: normalizeNickname(config.nickname),
            teleop_type: config.teleopType,
            left_arm_port: config.leftArmPort,
            right_arm_port: config.rightArmPort,
            full_reset: config.fullReset,
        },
    });
};

export const useDesktopTeleopCalibrationStatus = (
    nickname: string,
    teleopType = DEFAULT_DESKTOP_TELEOP_TYPE,
    enabled = true
) =>
    useQuery({
        queryKey: DESKTOP_TELEOP_CALIBRATION_KEY(nickname, teleopType),
        queryFn: () => getDesktopTeleopCalibrationStatus({ nickname, teleopType }),
        enabled: enabled && nickname.trim().length > 0,
        staleTime: 30000,
        refetchOnWindowFocus: true,
        retry: 1,
    });

export const useDesktopTeleopAutoCalibrate = () =>
    useMutation({
        mutationFn: runDesktopTeleopAutoCalibrate,
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({
                queryKey: DESKTOP_TELEOP_CALIBRATION_KEY(variables.nickname, variables.teleopType),
            });
        },
    });
