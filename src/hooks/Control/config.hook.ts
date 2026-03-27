import { getCalibrationModifiedAt, readCalibration } from '@/utils/config/calibration';
import { useQuery } from '@tanstack/react-query';

export const BASE_CONTROL_CONFIG_KEY = 'control-config';
export const CONTROL_CONFIG_KEY = (nickname: string) => [BASE_CONTROL_CONFIG_KEY, nickname];

export const BASE_CONTROL_CALIBRATION_KEY = 'control-calibration';
export const CONTROL_CALIBRATION_KEY = (robot_type: string, nickname: string) => [BASE_CONTROL_CALIBRATION_KEY, robot_type, nickname];
export const BASE_CONTROL_CALIBRATION_MODIFIED_AT_KEY = 'control-calibration-modified-at';
export const CONTROL_CALIBRATION_MODIFIED_AT_KEY = (robot_type: string, nickname: string) => [
    BASE_CONTROL_CALIBRATION_MODIFIED_AT_KEY,
    robot_type,
    nickname,
];

//---------------------------------------------------------------------------------------------------//
// Calibration Config
//---------------------------------------------------------------------------------------------------//
export const getCalibration = async (robot_type: string, nickname: string) => {
    const calibration = await readCalibration(robot_type, nickname);
    return calibration;
};

export const useGetCalibration = (robot_type: string, nickname: string, enabled = true) =>
    useQuery({
        queryKey: CONTROL_CALIBRATION_KEY(robot_type, nickname),
        queryFn: async () => await getCalibration(robot_type, nickname),
        enabled,
    });

export const getCalibrationModifiedAtTimestamp = async (robot_type: string, nickname: string) => {
    return await getCalibrationModifiedAt(robot_type, nickname);
};

export const useGetCalibrationModifiedAt = (robot_type: string, nickname: string, enabled = true) =>
    useQuery({
        queryKey: CONTROL_CALIBRATION_MODIFIED_AT_KEY(robot_type, nickname),
        queryFn: async () => await getCalibrationModifiedAtTimestamp(robot_type, nickname),
        enabled,
    });
