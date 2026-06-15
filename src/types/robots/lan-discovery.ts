export type DiscoveredLanRobot = {
    ipAddress: string;
    source: string;
    commandPort: number;
    observationPort: number;
    robotName?: string | null;
    nickname?: string | null;
    robotType?: string | null;
};

export type LanRobotDiscoveryResult = {
    localIp: string;
    subnet: string;
    hosts: DiscoveredLanRobot[];
    message?: string | null;
};
