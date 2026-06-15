import { invoke } from '@tauri-apps/api/core';
import type { LanRobotDiscoveryResult } from '@/types/robots/lan-discovery';

export const discoverLanRobots = async (): Promise<LanRobotDiscoveryResult> => {
    const result = await invoke<LanRobotDiscoveryResult>('discover_lan_robots');
    return result;
};
