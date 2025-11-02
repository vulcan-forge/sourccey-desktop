import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { ControlType, setControlledRobot, useGetControlledRobot, useGetControlledRobots } from '@/hooks/Control/control.hook';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { useGetConfig } from '@/hooks/Control/config.hook';
import { type CameraConfig } from '@/components/PageComponents/OwnedRobots/Teleop/TeleopAction';
import { useGetReplayConfig } from '@/hooks/Components/OwnedRobots/config.hook';
import { RobotAction } from '@/components/PageComponents/OwnedRobots/RobotAction';
import type { ReplayConfig, ReplayDatasetConfig } from '@/components/PageComponents/OwnedRobots/Replay/ReplayConfig';

export const ReplayAction = ({ ownedRobot, onClose = () => {}, logs = true }: { ownedRobot: any; onClose: () => void; logs: boolean }) => {
    const [isLoading, setIsLoading] = useState(false);

    const nickname = ownedRobot?.nickname ?? '';
    const { data: controlledRobot }: any = useGetControlledRobot(nickname);
    const controlType = controlledRobot?.controlType;
    const isControlling = !!controlledRobot?.ownedRobot;

    const { data: config }: any = useGetConfig(nickname);
    const { data: replayDataConfig }: any = useGetReplayConfig(nickname);

    const startReplay = async (nickname: string) => {
        if (isControlling) {
            return;
        }

        if (!config.cameras || Object.keys(config.cameras).length === 0) {
            toast.error('No cameras found. Please add a camera to the config in order to start replay', {
                ...toastErrorDefaults,
            });
            return;
        }

        const cameraKey = Object.keys(config.cameras)[0];
        const cameraObj = config.cameras[cameraKey ?? ''];
        const cameraConfig: CameraConfig = {
            camera_name: cameraKey ?? '',
            camera_type: cameraObj.type,
            camera_index: cameraObj.camera_index,
            width: cameraObj.width,
            height: cameraObj.height,
            fps: cameraObj.fps,
        };

        const replayDatasetConfig: ReplayDatasetConfig = {
            dataset: replayDataConfig.dataset,
            episode_number: replayDataConfig.episode_number,
        };

        const replayConfig: ReplayConfig = {
            nickname,
            robot_port: config.follower_arms.main.port,
            camera_config: cameraConfig,
            dataset: replayDatasetConfig,
        };

        const result = await invoke('start_replay', { config: replayConfig });
        toast.success(`Replay started: ${result}`, {
            ...toastSuccessDefaults,
        });
        setControlledRobot(nickname, ControlType.REPLAY, ownedRobot);
    };

    const stopReplay = async (nickname: string) => {
        if (!isControlling) {
            return;
        }

        const result = await invoke('stop_replay', { nickname });
        toast.success(`Replay stopped: ${result}`, {
            ...toastSuccessDefaults,
        });
        setControlledRobot(nickname, ControlType.REPLAY, null);
        onClose();
    };

    const toggleReplay = async () => {
        try {
            setIsLoading(true);
            if (isControlling) {
                await stopReplay(nickname);
            } else {
                await startReplay(nickname);
            }
        } catch (error) {
            console.error('Failed to toggle control:', error);
            toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`, {
                ...toastErrorDefaults,
            });
            setControlledRobot(nickname, ControlType.REPLAY, null);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <RobotAction
            ownedRobot={ownedRobot}
            toggleControl={toggleReplay}
            isLoading={isLoading}
            isControlling={isControlling}
            controlType={controlType}
            logs={logs}
        />
    );
};
