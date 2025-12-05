import { invoke } from '@tauri-apps/api/core';

export const readCalibration = async (robot_type: string, nickname: string) => {
    const calibration = await invoke('read_calibration', { robot_type, nickname });
    return calibration;
};
