import { invoke } from '@tauri-apps/api/core';
import type { Robot } from '@/types/Models/robot';

export const getAllRobots = async (): Promise<Robot[]> => {
    const result = await invoke<Robot[]>('get_all_robots');
    return result;
};
