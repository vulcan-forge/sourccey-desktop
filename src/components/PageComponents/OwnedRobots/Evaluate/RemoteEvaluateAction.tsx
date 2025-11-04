import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';
import { useGetRemoteEvaluateConfig } from '@/hooks/Components/OwnedRobots/remote-config.hook';
import { RemoteRobotAction } from '@/components/PageComponents/OwnedRobots/RemoteRobotAction';
import { RemoteControlType, RemoteRobotStatus, setRemoteRobotState, useGetRemoteRobotState } from '@/hooks/Control/remote-control.hook';
import { RemoteEvaluateConfig, type RemoteEvaluateDatasetConfig } from '@/components/PageComponents/OwnedRobots/Evaluate/RemoteEvaluateConfig';

export const RemoteEvaluateAction = ({
    ownedRobot,
    onClose = () => {},
    logs = true,
}: {
    ownedRobot: any;
    onClose: () => void;
    logs: boolean;
}) => {
    const [isLoading, setIsLoading] = useState(false);

    const nickname = ownedRobot?.nickname ?? '';
    const { data: remoteRobotState }: any = useGetRemoteRobotState(nickname);
    const robotStatus = remoteRobotState?.status;
    const controlType = remoteRobotState?.controlType;
    const isControlling = robotStatus == RemoteRobotStatus.STARTED && controlType == RemoteControlType.EVALUATE;

    const { data: config }: any = useGetRemoteConfig(nickname);
    const { data: remoteEvaluateConfig }: any = useGetRemoteEvaluateConfig(nickname);

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

        const evaluateDatasetConfig: RemoteEvaluateDatasetConfig = {
            ...remoteEvaluateConfig,
            fps: remoteEvaluateConfig.fps,
        };

        const evaluateConfig: RemoteEvaluateConfig = {
            nickname,
            remote_ip: config.remote_ip,
            model_name: evaluateDatasetConfig.model_name,
            model_steps: evaluateDatasetConfig.model_steps,
            dataset: evaluateDatasetConfig,
        };

        const result = await invoke('start_remote_evaluate', { config: evaluateConfig });
        toast.success(`Evaluate started: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.EVALUATE, ownedRobot);
    };

    const stopEvaluate = async (nickname: string, model_name: string) => {
        if (!isControlling) {
            return;
        }

        const result = await invoke('stop_remote_evaluate', { model_name });
        toast.success(`Evaluate stopped: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.NONE, ownedRobot);
        onClose();
    };

    const toggleEvaluate = async () => {
        try {
            setIsLoading(true);
            if (isControlling) {
                await stopEvaluate(nickname, remoteEvaluateConfig.model_name);
            } else {
                await startEvaluate(nickname);
            }
        } catch (error) {
            console.error('Failed to toggle control:', error);
            toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`, {
                ...toastErrorDefaults,
            });
            setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.NONE, ownedRobot);
        } finally {
            setIsLoading(false);
        }
    };

    const saveEpisode = async (nickname: string) => {
        const result = await invoke('save_remote_evaluate_episode', { nickname });
        toast.success(`Episode saved: ${result}`, {
            ...toastSuccessDefaults,
        });
    };

    const resetEpisode = async (nickname: string) => {
        const result = await invoke('reset_remote_evaluate_episode', { nickname });
        toast.success(`Episode reset: ${result}`, {
            ...toastSuccessDefaults,
        });
    };

    return (
        <RemoteRobotAction
            ownedRobot={ownedRobot}
            toggleControl={toggleEvaluate}
            saveEpisode={() => saveEpisode(nickname)}
            resetEpisode={() => resetEpisode(nickname)}
            isLoading={isLoading}
            isControlling={isControlling}
            robotStatus={robotStatus}
            controlType={controlType}
            logs={logs}
        />
    );
};
