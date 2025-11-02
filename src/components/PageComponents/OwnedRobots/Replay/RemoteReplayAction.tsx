import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { RemoteRobotAction } from '@/components/PageComponents/OwnedRobots/RemoteRobotAction';
import { RemoteControlType, setRemoteControlledRobot, useGetRemoteControlledRobot } from '@/hooks/Control/remote-control.hook';
import { useGetRemoteReplayConfig } from '@/hooks/Components/OwnedRobots/remote-config.hook';
import type { RemoteReplayConfig, RemoteReplayDatasetConfig } from '@/components/PageComponents/OwnedRobots/Replay/RemoteReplayConfig';
import { useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';

export const RemoteReplayAction = ({
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
    const { data: remoteControlledRobot }: any = useGetRemoteControlledRobot(nickname);
    const controlType = remoteControlledRobot?.controlType;
    const isControlling =
        !!remoteControlledRobot?.controlledRobot && controlType !== RemoteControlType.CONNECT && controlType !== RemoteControlType.STARTED;

    const { data: config }: any = useGetRemoteConfig(nickname);
    const { data: remoteReplayConfig }: any = useGetRemoteReplayConfig(nickname);

    const startReplay = async (nickname: string) => {
        if (isControlling) {
            return;
        }

        const remoteReplayDatasetConfig: RemoteReplayDatasetConfig = {
            ...remoteReplayConfig,
            fps: remoteReplayConfig.fps,
        };

        const replayConfig: RemoteReplayConfig = {
            nickname,
            remote_ip: config.remote_ip,
            dataset: remoteReplayDatasetConfig,
        };

        const result = await invoke('start_remote_replay', { config: replayConfig });
        toast.success(`Replay started: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteControlledRobot(nickname, RemoteControlType.REPLAY, ownedRobot);
    };

    const stopReplay = async (nickname: string) => {
        if (!isControlling) {
            return;
        }

        const result = await invoke('stop_remote_replay', { nickname });
        toast.success(`Replay stopped: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteControlledRobot(nickname, RemoteControlType.STARTED, ownedRobot);
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
            setRemoteControlledRobot(nickname, RemoteControlType.STARTED, ownedRobot);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <RemoteRobotAction
            ownedRobot={ownedRobot}
            toggleControl={toggleReplay}
            isLoading={isLoading}
            isControlling={isControlling}
            controlType={controlType}
            logs={logs}
        />
    );
};
