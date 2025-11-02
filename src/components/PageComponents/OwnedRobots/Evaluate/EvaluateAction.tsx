import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { ControlType, setControlledRobot, useGetControlledRobot, useGetControlledRobots } from '@/hooks/Control/control.hook';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useGetConfig } from '@/hooks/Control/config.hook';
import { useGetEvaluateConfig } from '@/hooks/Components/OwnedRobots/config.hook';
import type { CameraConfig } from '../Teleop/TeleopAction';
import { RobotAction } from '@/components/PageComponents/OwnedRobots/RobotAction';
import type { EvaluateConfig, EvaluateDatasetConfig } from '@/components/PageComponents/OwnedRobots/Evaluate/EvaluateConfig';

export const EvaluateAction = ({ ownedRobot, onClose = () => {}, logs = true }: { ownedRobot: any; onClose: () => void; logs: boolean }) => {
    const [isLoading, setIsLoading] = useState(false);

    const nickname = ownedRobot?.nickname ?? '';
    const { data: controlledRobot }: any = useGetControlledRobot(nickname);
    const controlType = controlledRobot?.controlType;
    const isControlling = !!controlledRobot?.ownedRobot;

    const { data: config }: any = useGetConfig(nickname);
    const { data: evaluateDataConfig }: any = useGetEvaluateConfig(nickname);

    useEffect(() => {
        if (!isControlling) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            const key = e.key.toUpperCase();

            // Handle arrow keys for episode control
            if (key === 'ARROWLEFT') {
                resetEpisode(nickname);
                return;
            }
            if (key === 'ARROWRIGHT') {
                saveEpisode(nickname);
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isControlling, nickname]);

    const startEvaluate = async (nickname: string) => {
        if (isControlling) {
            return;
        }

        if (!config.cameras || Object.keys(config.cameras).length === 0) {
            toast.error('No cameras found. Please add a camera to the config in order to start evaluation', {
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

        const evaluateDatasetConfig: EvaluateDatasetConfig = {
            dataset: evaluateDataConfig.dataset,
            num_episodes: evaluateDataConfig.num_episodes,
            task: evaluateDataConfig.task,
            episode_time_s: evaluateDataConfig.episode_time_s,
            reset_time_s: evaluateDataConfig.reset_time_s,
            model_name: evaluateDataConfig.model_name,
            model_steps: evaluateDataConfig.model_steps,
        };

        const evaluateConfig: EvaluateConfig = {
            nickname,
            robot_port: config.follower_arms.main.port,
            camera_config: cameraConfig,
            model_name: evaluateDatasetConfig.model_name,
            model_steps: evaluateDatasetConfig.model_steps,
            dataset: evaluateDatasetConfig,
        };

        const result = await invoke('start_evaluate', { config: evaluateConfig });
        toast.success(`Evaluate started: ${result}`, {
            ...toastSuccessDefaults,
        });
        setControlledRobot(nickname, ControlType.EVALUATE, ownedRobot);
    };

    const stopEvaluate = async (nickname: string) => {
        if (!isControlling) {
            return;
        }

        const result = await invoke('stop_evaluate', { nickname });
        toast.success(`Evaluate stopped: ${result}`, {
            ...toastSuccessDefaults,
        });
        setControlledRobot(nickname, ControlType.EVALUATE, null);
        onClose();
    };

    const toggleEvaluate = async () => {
        try {
            setIsLoading(true);
            if (isControlling) {
                await stopEvaluate(nickname);
            } else {
                await startEvaluate(nickname);
            }
        } catch (error) {
            console.error('Failed to toggle control:', error);
            toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`, {
                ...toastErrorDefaults,
            });
            setControlledRobot(nickname, ControlType.EVALUATE, null);
        } finally {
            setIsLoading(false);
        }
    };

    const saveEpisode = async (nickname: string) => {
        const result = await invoke('save_evaluate_episode', { nickname });
        toast.success(`Episode saved: ${result}`, {
            ...toastSuccessDefaults,
        });
    };

    const resetEpisode = async (nickname: string) => {
        const result = await invoke('reset_evaluate_episode', { nickname });
        toast.success(`Episode reset: ${result}`, {
            ...toastSuccessDefaults,
        });
    };

    return (
        <RobotAction
            ownedRobot={ownedRobot}
            toggleControl={toggleEvaluate}
            saveEpisode={() => saveEpisode(nickname)}
            resetEpisode={() => resetEpisode(nickname)}
            isLoading={isLoading}
            isControlling={isControlling}
            controlType={controlType}
            logs={logs}
        />
    );
};
