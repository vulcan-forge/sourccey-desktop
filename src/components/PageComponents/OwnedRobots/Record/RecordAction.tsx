import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useGetRecordConfig } from '@/hooks/Components/OwnedRobots/config.hook';
import { ControlType, setControlledRobot, useGetControlledRobot } from '@/hooks/Control/control.hook';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { useGetConfig } from '@/hooks/Control/config.hook';
import { type CameraConfig } from '@/components/PageComponents/OwnedRobots/Teleop/TeleopAction';
import { RobotAction } from '@/components/PageComponents/OwnedRobots/RobotAction';
import type { RecordConfig, RecordDatasetConfig } from '@/components/PageComponents/OwnedRobots/Record/RecordConfig';

export const RecordAction = ({ ownedRobot, logs = true }: { ownedRobot: any; logs: boolean }) => {
    const nickname = ownedRobot?.nickname ?? '';

    // Control Settings
    const [isLoading, setIsLoading] = useState(false);

    const { data: controlledRobot }: any = useGetControlledRobot(nickname);
    const controlType = controlledRobot?.controlType;
    const isControlling = !!controlledRobot?.ownedRobot;

    const { data: config }: any = useGetConfig(nickname);
    const { data: recordDataConfig }: any = useGetRecordConfig(nickname);

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

    const startRecord = async () => {
        if (isControlling) {
            return;
        }

        if (!config.cameras || Object.keys(config.cameras).length === 0) {
            toast.error('No cameras found. Please add a camera to the config in order to start recording', {
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

        const recordDatasetConfig: RecordDatasetConfig = {
            dataset: recordDataConfig.dataset,
            num_episodes: recordDataConfig.num_episodes,
            task: recordDataConfig.task,
            episode_time_s: recordDataConfig.episode_time_s,
            reset_time_s: recordDataConfig.reset_time_s,
        };

        const recordConfig: RecordConfig = {
            nickname,
            robot_port: config.follower_arms.main.port,
            teleop_port: config.leader_arms.main.port,
            camera_config: cameraConfig,
            dataset: recordDatasetConfig,
        };

        const result = await invoke('start_record', { config: recordConfig });
        toast.success(`Record started: ${result}`, {
            ...toastSuccessDefaults,
        });
        setControlledRobot(nickname, ControlType.RECORD, ownedRobot);
    };

    const stopRecord = async (nickname: string) => {
        if (!isControlling) {
            return;
        }

        const result = await invoke('stop_record', { nickname });
        toast.success(`Record stopped: ${result}`, {
            ...toastSuccessDefaults,
        });
        setControlledRobot(nickname, ControlType.RECORD, null);
    };

    const toggleControl = async () => {
        try {
            setIsLoading(true);
            if (isControlling) {
                await stopRecord(nickname);
            } else {
                await startRecord();
            }
        } catch (error) {
            console.error('Failed to toggle control:', error);
            toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`, {
                ...toastErrorDefaults,
            });
            setControlledRobot(nickname, ControlType.RECORD, null);
        } finally {
            setIsLoading(false);
        }
    };

    const saveEpisode = async (nickname: string) => {
        const result = await invoke('save_record_episode', { nickname });
        toast.success(`Episode saved: ${result}`, {
            ...toastSuccessDefaults,
        });
    };

    const resetEpisode = async (nickname: string) => {
        const result = await invoke('reset_record_episode', { nickname });
        toast.success(`Episode reset: ${result}`, {
            ...toastSuccessDefaults,
        });
    };

    return (
        <RobotAction
            ownedRobot={ownedRobot}
            toggleControl={toggleControl}
            saveEpisode={() => saveEpisode(nickname)}
            resetEpisode={() => resetEpisode(nickname)}
            isLoading={isLoading}
            isControlling={isControlling}
            controlType={controlType}
            logs={logs}
        />
    );
};
