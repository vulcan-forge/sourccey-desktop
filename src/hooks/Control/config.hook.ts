import type { Config } from '@/components/PageComponents/OwnedRobots/RobotConfig';
import { queryClient } from '@/hooks/default';
import { readCalibration } from '@/utils/config/calibration';
import { useQuery } from '@tanstack/react-query';

export const BASE_CONTROL_CONFIG_KEY = 'control-config';
export const CONTROL_CONFIG_KEY = (nickname: string) => [BASE_CONTROL_CONFIG_KEY, nickname];

export const BASE_CONTROL_CALIBRATION_KEY = 'control-calibration';
export const IS_CALIBRATED_KEY = [BASE_CONTROL_CALIBRATION_KEY, 'is-calibrated'];
export const CONTROL_CALIBRATION_KEY = (nickname: string) => [BASE_CONTROL_CALIBRATION_KEY, nickname];

//---------------------------------------------------------------------------------------------------//
// Config Config
//---------------------------------------------------------------------------------------------------//
export const defaultConfig: Config = {
    leader_arms: {
        main: {
            port: 'COM18',
        },
    },
    follower_arms: {
        main: {
            port: 'COM21',
        },
    },
    cameras: {
        main: {
            type: 'opencv',
            camera_index: 0,
            fps: 30,
            width: 640,
            height: 480,
            color_mode: 'rgb',
        },
    },
};

export const getConfig = (nickname: string) => queryClient.getQueryData(CONTROL_CONFIG_KEY(nickname)) ?? defaultConfig;
export const setConfig = (nickname: string, config: Config | null) => queryClient.setQueryData(CONTROL_CONFIG_KEY(nickname), config);
export const useGetConfig = (nickname: string) => useQuery({ queryKey: CONTROL_CONFIG_KEY(nickname), queryFn: () => getConfig(nickname) });

//---------------------------------------------------------------------------------------------------//
// Calibration Config
//---------------------------------------------------------------------------------------------------//
export const getCalibration = async (nickname: string) => {
    const calibration = await readCalibration(nickname);
    return calibration;
};

export const useGetCalibration = (nickname: string) =>
    useQuery({ queryKey: CONTROL_CALIBRATION_KEY(nickname), queryFn: async () => await getCalibration(nickname) });

//---------------------------------------------------------------------------------------------------//
// Is Calibrated Config
//---------------------------------------------------------------------------------------------------//
export const getIsCalibrated = () => queryClient.getQueryData(IS_CALIBRATED_KEY) ?? false;
export const setIsCalibrated = (isCalibrated: boolean) => queryClient.setQueryData(IS_CALIBRATED_KEY, isCalibrated);
export const useGetIsCalibrated = () =>
    useQuery({
        queryKey: IS_CALIBRATED_KEY,
        queryFn: () => getIsCalibrated(),
        staleTime: Infinity,
        gcTime: Infinity,
    });
