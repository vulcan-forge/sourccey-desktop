import type { RemoteConfig } from '@/components/PageComponents/Robots/Config/RemoteRobotConfig';
import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';
import { invoke, isTauri } from '@tauri-apps/api/core';

export const BASE_REMOTE_CONTROL_CONFIG_KEY = 'remote-control-config';

export const REMOTE_CONFIG_KEY = (nickname: string) => [BASE_REMOTE_CONTROL_CONFIG_KEY, 'config', nickname];

//---------------------------------------------------------------------------------------------------//
// Config Config
//---------------------------------------------------------------------------------------------------//
export const defaultRemoteConfig: RemoteConfig = {
    remote_ip: '192.168.1.237',
    remote_port: '22',
    username: 'sourccey',
    password: 'vulcan',
    left_arm_port: 'COM3',
    right_arm_port: 'COM8',
    keyboard: 'keyboard',
    fps: 30,
};

export const getRemoteConfig = (nickname: string) => queryClient.getQueryData(REMOTE_CONFIG_KEY(nickname)) ?? defaultRemoteConfig;
export const setRemoteConfig = (nickname: string, config: RemoteConfig | null) => queryClient.setQueryData(REMOTE_CONFIG_KEY(nickname), config);
export const useGetRemoteConfig = (nickname: string) =>
    useQuery({
        queryKey: REMOTE_CONFIG_KEY(nickname),
        queryFn: async () => {
            const cached = getRemoteConfig(nickname);
            if (!isTauri()) {
                return cached;
            }

            try {
                const config = await invoke<RemoteConfig>('read_remote_config', { nickname });
                setRemoteConfig(nickname, config);
                return config;
            } catch (error) {
                console.error('Failed to load remote config:', error);
                return cached;
            }
        },
        enabled: nickname.length > 0,
    });
