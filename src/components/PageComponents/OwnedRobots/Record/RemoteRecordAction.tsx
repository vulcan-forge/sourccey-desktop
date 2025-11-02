import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { RemoteRobotAction } from '@/components/PageComponents/OwnedRobots/RemoteRobotAction';
import { RemoteControlType, setRemoteControlledRobot, useGetRemoteControlledRobot } from '@/hooks/Control/remote-control.hook';
import { useGetRemoteRecordConfig } from '@/hooks/Components/OwnedRobots/remote-config.hook';
import { useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';
import type { RemoteRecordConfig, RemoteRecordDatasetConfig } from '@/components/PageComponents/OwnedRobots/Record/RemoteRecordConfig';

export const RemoteRecordAction = ({ ownedRobot, logs = true }: { ownedRobot: any; logs: boolean }) => {
    const nickname = ownedRobot?.nickname ?? '';

    // Control Settings
    const [isLoading, setIsLoading] = useState(false);

    const { data: remoteControlledRobot }: any = useGetRemoteControlledRobot(nickname);
    const controlType = remoteControlledRobot?.controlType;
    const isControlling =
        !!remoteControlledRobot?.controlledRobot && controlType !== RemoteControlType.CONNECT && controlType !== RemoteControlType.STARTED;

    const { data: remoteConfig }: any = useGetRemoteConfig(nickname);
    const { data: remoteRecordDatasetConfig }: any = useGetRemoteRecordConfig(nickname);

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

        const recordDatasetConfig: RemoteRecordDatasetConfig = {
            ...remoteRecordDatasetConfig,
            fps: remoteConfig.fps,
        };

        const recordConfig: RemoteRecordConfig = {
            nickname,
            remote_ip: remoteConfig.remote_ip,
            left_arm_port: remoteConfig.left_arm_port,
            right_arm_port: remoteConfig.right_arm_port,
            keyboard: remoteConfig.keyboard,
            dataset: recordDatasetConfig,
        };

        const result = await invoke('start_remote_record', { config: recordConfig });
        toast.success(`Record started: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteControlledRobot(nickname, RemoteControlType.RECORD, ownedRobot);
    };

    const stopRecord = async (nickname: string) => {
        if (!isControlling) {
            return;
        }

        const result = await invoke('stop_remote_record', { nickname });
        toast.success(`Record stopped: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteControlledRobot(nickname, RemoteControlType.STARTED, ownedRobot);
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
            setRemoteControlledRobot(nickname, RemoteControlType.STARTED, ownedRobot);
        } finally {
            setIsLoading(false);
        }
    };

    const saveEpisode = async (nickname: string) => {
        const result = await invoke('save_remote_record_episode', { nickname });
        toast.success(`Episode saved: ${result}`, {
            ...toastSuccessDefaults,
        });
    };

    const resetEpisode = async (nickname: string) => {
        const result = await invoke('reset_remote_record_episode', { nickname });
        toast.success(`Episode reset: ${result}`, {
            ...toastSuccessDefaults,
        });
    };

    return (
        <RemoteRobotAction
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
