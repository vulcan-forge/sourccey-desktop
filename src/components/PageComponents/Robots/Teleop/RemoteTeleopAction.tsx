import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { FaGamepad, FaPlay, FaStop } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import { useGetCalibration } from '@/hooks/Control/config.hook';
import { RemoteControlType, RemoteRobotStatus, setRemoteRobotState, useGetRemoteRobotState } from '@/hooks/Control/remote-control.hook';
import { useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';

export enum RobotControlStatus {
    STARTED = 'Robot is being controlled',
    STOPPED = 'Robot is not being controlled',
}

export const RemoteTeleopAction = ({
    ownedRobot,
    onClose = () => {},
    logsSlot,
}: {
    ownedRobot: any;
    onClose: () => void;
    logsSlot?: React.ReactNode;
}) => {
    const [isLoading, setIsLoading] = useState(false);

    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = nickname.startsWith('@') ? nickname.slice(1) : nickname;
    const { data: remoteRobotState }: any = useGetRemoteRobotState(nickname);
    const { data: remoteConfig }: any = useGetRemoteConfig(nickname);
    const robotType = ownedRobot?.robot_type ?? '';
    const { data: calibration, isLoading: isLoadingCalibration }: any = useGetCalibration(robotType, nickname);

    const robotStatus = remoteRobotState?.status;
    const controlType = remoteRobotState?.controlType;
    const isControlling = robotStatus == RemoteRobotStatus.STARTED && controlType == RemoteControlType.TELEOP;
    const isCalibrationLoading = isLoading || isLoadingCalibration;
    const isControlDisabled = isCalibrationLoading || !calibration;

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
        <div className="flex flex-col gap-4 rounded-lg border-2 border-slate-700/60 bg-slate-800 p-5">
            <div className="flex items-center justify-between gap-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                    <FaGamepad className="h-5 w-5 text-slate-400" />
                    Teleoperate Robot
                </h2>
                <button
                    onClick={toggleControl}
                    disabled={isControlDisabled}
                    data-tooltip-id="teleop-control-tooltip"
                    data-tooltip-content={isControlDisabled ? 'Auto calibration required before controlling' : ''}
                    className={`inline-flex w-36 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
                        isControlDisabled
                            ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                            : isControlling
                              ? 'cursor-pointer bg-red-500 text-white hover:bg-red-600'
                              : 'cursor-pointer bg-green-600 text-white hover:bg-green-700'
                    }`}
                >
                    {isCalibrationLoading ? (
                        <span className="animate-spin">âŒ›</span>
                    ) : isControlling ? (
                        <>
                            <FaStop className="h-4 w-4" /> Stop Control
                        </>
                    ) : (
                        <>
                            <FaPlay className="h-4 w-4" /> Start Control
                        </>
                    )}
                </button>
            </div>
            {logsSlot}
            <Tooltip
                id="teleop-control-tooltip"
                place="top"
                className="custom-tooltip !z-[1000] !max-w-xs !rounded-lg !border-2 !border-slate-600 !bg-slate-700 !px-3 !py-2 !text-sm !break-words !whitespace-pre-wrap !text-slate-100"
                border="2px solid #475569"
                arrowColor="#334155"
                classNameArrow="!shadow-none"
            />
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
    [RemoteControlType.INFERENCE]: 'Start Inference',
};

export const stopRemoteControlText = {
    [RemoteControlType.TELEOP]: 'Stop Control',
    [RemoteControlType.INFERENCE]: 'Stop Inference',
};
