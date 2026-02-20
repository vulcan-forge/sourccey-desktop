import type { RemoteTeleopConfig } from '@/components/PageComponents/Robots/Teleop/RemoteTeleopAction';
import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

export const BASE_REMOTE_ROBOTS_CONFIG_KEY = 'remote-robots-config';
export const REMOTE_ROBOT_TELEOP_KEY = (nickname: string) => [BASE_REMOTE_ROBOTS_CONFIG_KEY, 'teleop', nickname];

//---------------------------------------------------------------------------------------------------//
// Remote Robot Teleop Functions
//---------------------------------------------------------------------------------------------------//
export const getRemoteTeleopConfig = (nickname: string) => queryClient.getQueryData(REMOTE_ROBOT_TELEOP_KEY(nickname));
export const setRemoteTeleopConfig = (nickname: string, config: RemoteTeleopConfig) =>
    queryClient.setQueryData(REMOTE_ROBOT_TELEOP_KEY(nickname), config);
export const useGetRemoteTeleopConfig = (nickname: string) =>
    useQuery({
        queryKey: REMOTE_ROBOT_TELEOP_KEY(nickname),
        queryFn: () => getRemoteTeleopConfig(nickname) ?? defaultRemoteTeleopConfig(),
    });

const defaultRemoteTeleopConfig = (): RemoteTeleopConfig => ({
    nickname: 'sourccey',
    remote_ip: '192.168.1.225',
    left_arm_port: 'COM3',
    right_arm_port: 'COM8',
    keyboard: 'keyboard',
    fps: 30,
});
