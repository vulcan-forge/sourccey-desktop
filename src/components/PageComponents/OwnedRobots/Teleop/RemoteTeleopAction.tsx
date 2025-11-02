import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { RemoteRobotAction } from '@/components/PageComponents/OwnedRobots/RemoteRobotAction';
import { RemoteControlType, setRemoteControlledRobot, useGetRemoteControlledRobot } from '@/hooks/Control/remote-control.hook';
import { useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';

export enum RobotControlStatus {
    STARTED = 'Robot is being controlled',
    STOPPED = 'Robot is not being controlled',
}

export const RemoteTeleopAction = ({
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

    const { data: remoteConfig }: any = useGetRemoteConfig(nickname);

    const startTeleop = async (nickname: string) => {
        if (isControlling) {
            return;
        }

        const remoteTeleopConfig: RemoteTeleopConfig = {
            nickname,
            remote_ip: remoteConfig.remote_ip,
            left_arm_port: remoteConfig.left_arm_port,
            right_arm_port: remoteConfig.right_arm_port,
            keyboard: remoteConfig.keyboard,
            fps: remoteConfig.fps,
        };

        const result = await invoke('start_remote_teleop', { config: remoteTeleopConfig });
        toast.success(`Remote Teleop started: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteControlledRobot(nickname, RemoteControlType.TELEOP, ownedRobot);
    };

    const stopTeleop = async (nickname: string) => {
        if (!isControlling) {
            return;
        }

        const result = await invoke('stop_remote_teleop', { nickname });
        toast.success(`Remote Teleop stopped: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteControlledRobot(nickname, RemoteControlType.STARTED, ownedRobot);
        onClose();
    };

    const toggleControl = async () => {
        try {
            setIsLoading(true);
            if (isControlling) {
                await stopTeleop(nickname);
            } else {
                await startTeleop(nickname);
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
            toggleControl={toggleControl}
            isLoading={isLoading}
            isControlling={isControlling}
            controlType={controlType}
            logs={logs}
        />
    );
};

export interface RemoteTeleopConfig {
    nickname: string;
    remote_ip: string;
    left_arm_port: string;
    right_arm_port: string;
    keyboard: string;
    fps: number;
}

export const startRemoteControlText = {
    [RemoteControlType.TELEOP]: 'Start Control',
    [RemoteControlType.RECORD]: 'Start Record',
    [RemoteControlType.REPLAY]: 'Start Replay',
    [RemoteControlType.EVALUATE]: 'Start Evaluation',
};

export const stopRemoteControlText = {
    [RemoteControlType.TELEOP]: 'Stop Control',
    [RemoteControlType.RECORD]: 'Stop Record',
    [RemoteControlType.REPLAY]: 'Stop Replay',
    [RemoteControlType.EVALUATE]: 'Stop Evaluation',
};
