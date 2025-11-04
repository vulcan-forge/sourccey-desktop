import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { ControlType, setControlledRobot, useGetControlledRobot, useGetControlledRobots } from '@/hooks/Control/control.hook';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { useGetConfig } from '@/hooks/Control/config.hook';
import { RobotAction } from '@/components/PageComponents/OwnedRobots/RobotAction';

export const TeleopAction = ({ ownedRobot, onClose = () => {}, logs = true }: { ownedRobot: any; onClose: () => void; logs: boolean }) => {
    const [isLoading, setIsLoading] = useState(false);

    const nickname = ownedRobot?.nickname ?? '';
    const { data: controlledRobot }: any = useGetControlledRobot(nickname);
    const controlType = controlledRobot?.controlType;
    const isControlling = !!controlledRobot?.ownedRobot;

    const { data: config }: any = useGetConfig(nickname);

    const startTeleop = async (nickname: string) => {
        if (isControlling) {
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

        const startTeleopConfig: StartTeleopConfig = {
            nickname,
            robot_port: config.follower_arms.main.port,
            teleop_port: config.leader_arms.main.port,
            camera_config: cameraConfig,
        };

        const result = await invoke('start_teleop', { config: startTeleopConfig });
        toast.success(`Teleop started: ${result}`, {
            ...toastSuccessDefaults,
        });
        setControlledRobot(nickname, ControlType.TELEOP, ownedRobot);
    };

    const stopTeleop = async (nickname: string) => {
        if (!isControlling) {
            return;
        }

        const result = await invoke('stop_teleop', { nickname });
        toast.success(`Teleop stopped: ${result}`, {
            ...toastSuccessDefaults,
        });
        setControlledRobot(nickname, ControlType.TELEOP, null);
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
            setControlledRobot(nickname, ControlType.TELEOP, null);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <RobotAction
            ownedRobot={ownedRobot}
            toggleControl={toggleControl}
            isLoading={isLoading}
            isControlling={isControlling}
            controlType={controlType}
            logs={logs}
        />
    );
};

export interface StartTeleopConfig {
    nickname: string;
    robot_port: string;
    teleop_port: string;
    camera_config?: CameraConfig;
}

export interface CameraConfig {
    camera_name: string;
    camera_type: string;
    camera_index: number;
    width: number;
    height: number;
    fps: number;
}
