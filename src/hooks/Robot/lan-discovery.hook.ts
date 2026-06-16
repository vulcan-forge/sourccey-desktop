import { discoverLanRobots } from '@/api/Local/Robot/discovery';
import { useQuery } from '@tanstack/react-query';

export const LAN_ROBOT_DISCOVERY_KEY = ['lan-robot-discovery'];

export const useLanRobotDiscovery = (enabled: boolean = true) =>
    useQuery({
        queryKey: LAN_ROBOT_DISCOVERY_KEY,
        queryFn: discoverLanRobots,
        enabled,
        staleTime: 5_000,
        refetchInterval: enabled ? 10_000 : false,
        refetchOnWindowFocus: false,
        placeholderData: (previousData) => previousData,
    });
