import type { BatteryData, ThermalData } from '@/hooks/System/system-info.hook';

export type DiscoveredLanRobot = {
    ipAddress: string;
    hostRunning?: boolean | null;
    source: string;
    commandPort: number;
    observationPort: number;
    protocolVersion?: number | null;
    robotName?: string | null;
    nickname?: string | null;
    robotType?: string | null;
    hostname?: string | null;
    capabilities?: string[] | null;
    batteryData?: BatteryData | null;
    thermalData?: ThermalData | null;
};

export type LanRobotDiscoveryResult = {
    localIp: string;
    subnet: string;
    hosts: DiscoveredLanRobot[];
    message?: string | null;
};
