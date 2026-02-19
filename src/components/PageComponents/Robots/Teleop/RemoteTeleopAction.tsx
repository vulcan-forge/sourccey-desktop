import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { RemoteRobotAction } from '@/components/PageComponents/Robots/RemoteRobotAction';
import { RemoteConfigSection } from '@/components/PageComponents/Robots/RemoteConfigSection';
import { RemoteControlType, RemoteRobotStatus, setRemoteRobotState, useGetRemoteRobotState } from '@/hooks/Control/remote-control.hook';
import { useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';
import { RobotLogs } from '@/components/PageComponents/Robots/Logs/RobotDesktopLogs';

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
    const [isConfigOpen, setIsConfigOpen] = useState(false);

    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = nickname.startsWith('@') ? nickname.slice(1) : nickname;
    const { data: remoteRobotState }: any = useGetRemoteRobotState(nickname);
    const { data: remoteConfig }: any = useGetRemoteConfig(nickname);

    const robotStatus = remoteRobotState?.status;
    const controlType = remoteRobotState?.controlType;
    const isControlling = robotStatus == RemoteRobotStatus.STARTED && controlType == RemoteControlType.TELEOP;

    const startTeleop = async (normalized: string) => {
        if (isControlling) {
            return;
        }

        const remoteTeleopConfig: RemoteTeleopConfig = {
            nickname: normalized,
            remote_ip: remoteConfig.remote_ip,
            left_arm_port: remoteConfig.left_arm_port,
            right_arm_port: remoteConfig.right_arm_port,
            keyboard: remoteConfig.keyboard,
            fps: remoteConfig.fps,
        };

        console.log('remoteTeleopConfig', remoteTeleopConfig);

        const result = await invoke('start_remote_teleop', { config: remoteTeleopConfig });
        toast.success(`Remote Teleop started: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.TELEOP, ownedRobot);
    };

    const stopTeleop = async (normalized: string) => {
        if (!isControlling) {
            return;
        }

        const result = await invoke('stop_remote_teleop', { nickname: normalized });
        toast.success(`Remote Teleop stopped: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
        onClose();
    };

    const toggleControl = async () => {
        try {
            setIsLoading(true);
            if (isControlling) {
                await stopTeleop(normalizedNickname);
            } else {
                await startTeleop(normalizedNickname);
            }
        } catch (error) {
            console.error('Failed to toggle control:', error);
            toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`, {
                ...toastErrorDefaults,
            });
            setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800/60 p-5">
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-300">
                    {isConfigOpen ? 'Remote Config' : 'Remote Teleop'}
                </div>
                <button
                    type="button"
                    onClick={() => setIsConfigOpen((open) => !open)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700"
                >
                    {isConfigOpen ? 'Back to Control' : 'Configs'}
                </button>
            </div>

            {isConfigOpen ? (
                <RemoteConfigSection ownedRobot={ownedRobot} embedded={true} showHeader={false} isOpen={true} />
            ) : (
                <>
                    <RemoteRobotAction
                        ownedRobot={ownedRobot}
                        toggleControl={toggleControl}
                        isLoading={isLoading}
                        isControlling={isControlling}
                        robotStatus={robotStatus}
                        controlType={controlType}
                        logs={logs}
                        allowUnconnectedControl={true}
                    />
                    <RobotLogs isControlling={isControlling} nickname={normalizedNickname} embedded={true} />
                </>
            )}
        </div>
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
    [RemoteControlType.INFERENCE]: 'Start AI',
};

export const stopRemoteControlText = {
    [RemoteControlType.TELEOP]: 'Stop Control',
    [RemoteControlType.INFERENCE]: 'Stop AI',
};
