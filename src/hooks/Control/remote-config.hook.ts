import type { RemoteConfig } from '@/types/remote-config';
import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';
import { invoke, isTauri } from '@tauri-apps/api/core';

export const BASE_REMOTE_CONTROL_CONFIG_KEY = 'remote-control-config';

export const REMOTE_CONFIG_KEY = (nickname: string) => [BASE_REMOTE_CONTROL_CONFIG_KEY, 'config', nickname];

//---------------------------------------------------------------------------------------------------//
// Config Config
//---------------------------------------------------------------------------------------------------//
export const defaultRemoteConfig: RemoteConfig = {
    remote_ip: '',
    remote_port: '22',
    left_arm_port: '',
    right_arm_port: '',
    keyboard: 'sourccey_keyboard',
    fps: 30,
};

const normalizeNickname = (nickname: string) => (nickname.startsWith('@') ? nickname.slice(1) : nickname);

const getDefaultRemoteConfig = (_nickname: string) => defaultRemoteConfig;

export const getRemoteConfig = (nickname: string) => queryClient.getQueryData(REMOTE_CONFIG_KEY(nickname)) ?? getDefaultRemoteConfig(nickname);
export const setRemoteConfig = (nickname: string, config: RemoteConfig | null) => queryClient.setQueryData(REMOTE_CONFIG_KEY(nickname), config);
export const useGetRemoteConfig = (nickname: string) =>
    useQuery({
        queryKey: REMOTE_CONFIG_KEY(nickname),
        queryFn: async () => {
            const cached: any = getRemoteConfig(nickname);
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
