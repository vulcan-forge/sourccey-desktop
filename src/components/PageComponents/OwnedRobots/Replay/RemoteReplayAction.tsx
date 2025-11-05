import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { RemoteRobotAction } from '@/components/PageComponents/OwnedRobots/RemoteRobotAction';
import { RemoteControlType, RemoteRobotStatus, setRemoteRobotState, useGetRemoteRobotState } from '@/hooks/Control/remote-control.hook';
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
    const { data: remoteRobotState }: any = useGetRemoteRobotState(nickname);

    const robotStatus = remoteRobotState?.status;
    const controlType = remoteRobotState?.controlType;
    const isControlling = robotStatus == RemoteRobotStatus.STARTED && controlType == RemoteControlType.REPLAY;

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
        setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.REPLAY, ownedRobot);
    };

    const stopReplay = async (nickname: string) => {
        if (!isControlling) {
            return;
        }

        const result = await invoke('stop_remote_replay', { nickname });
        toast.success(`Replay stopped: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.NONE, ownedRobot);
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
            setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.NONE, ownedRobot);
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
            robotStatus={robotStatus}
            controlType={controlType}
            logs={logs}
        />
    );
};
