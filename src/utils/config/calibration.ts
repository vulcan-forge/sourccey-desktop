import { invoke } from '@tauri-apps/api/core';

export const readCalibration = async (nickname: string) => {
    const calibration = await invoke('read_calibration', { nickname });
    return calibration;
};
