import { invoke } from '@tauri-apps/api/core';
import type { Robot } from '@/types/Models/robot';

export const getAllRobots = async (): Promise<Robot[]> => {
    const result = await invoke<Robot[]>('get_all_robots');
    return result;
};

export const upsertRobotTemplate = async (robotType?: string | null, robotName?: string | null): Promise<Robot> => {
    const result = await invoke<Robot>('upsert_robot_template', {
        robot_type: robotType ?? null,
        robot_name: robotName ?? null,
    });
    return result;
};
