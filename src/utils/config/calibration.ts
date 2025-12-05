import { invoke } from '@tauri-apps/api/core';

export const readCalibration = async (robot_type: string, nickname: string) => {
    console.log('before read');
    const calibration = await invoke('read_calibration', { nickname: nickname });
    console.log('after read calibration', calibration);
    return calibration;
};
