import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { FaCheckCircle, FaExclamationTriangle, FaGamepad, FaPlay, FaStop } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import { RemoteControlType, RemoteRobotStatus, setRemoteRobotState, useGetRemoteRobotState } from '@/hooks/Control/remote-control.hook';
import { useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';
import { Spinner } from '@/components/Elements/Spinner';
import { setContent } from '@/hooks/Components/OwnedRobots/owned-robots.hook';
import { DEFAULT_DESKTOP_TELEOP_TYPE, useDesktopTeleopCalibrationStatus } from '@/hooks/Control/desktop-calibration.hook';
import {
    getRemoteTeleopBlockingMessage,
    getRemoteTeleopReadiness,
} from '@/utils/teleop/remote-teleop-readiness';

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
    const { data: teleopCalibrationStatus, isLoading: isLoadingCalibration }: any = useDesktopTeleopCalibrationStatus(
        normalizedNickname,
        DEFAULT_DESKTOP_TELEOP_TYPE,
        normalizedNickname.length > 0
    );

    const robotStatus = remoteRobotState?.status;
    const controlType = remoteRobotState?.controlType;
    const isControlling = robotStatus == RemoteRobotStatus.STARTED && controlType == RemoteControlType.TELEOP;
    const isTeleopCalibrated = teleopCalibrationStatus?.isCalibrated === true;
    const isCalibrationLoading = isLoading || isLoadingCalibration;
    const readiness = getRemoteTeleopReadiness(remoteConfig, teleopCalibrationStatus);
    const readinessMessage = getRemoteTeleopBlockingMessage(readiness);
    const isControlDisabled = isCalibrationLoading || !readiness.ready;
    const showCalibrationButton = !isCalibrationLoading && !isTeleopCalibrated;

    const startTeleop = async (normalized: string) => {
        if (isControlling) {
            return;
        }

        if (!readiness.ready) {
            throw new Error(readinessMessage || 'Teleoperation setup is incomplete.');
        }

        const remoteTeleopConfig: RemoteTeleopConfig = {
            nickname: normalized,
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
                setRemoteRobotState(nickname, RemoteRobotStatus.STARTING, RemoteControlType.TELEOP, ownedRobot);
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
                <div className="flex items-center gap-2">
                    {showCalibrationButton && (
                        <button
                            type="button"
                            onClick={() => setContent('config')}
                            className="cursor-pointer rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/30"
                        >
                            Calibrate
                        </button>
                    )}
                    <button
                        onClick={toggleControl}
                        disabled={isControlDisabled}
                        data-tooltip-id="teleop-control-tooltip"
                        data-tooltip-content={isControlDisabled ? readinessMessage || 'Teleoperation setup is incomplete.' : ''}
                        className={`inline-flex w-36 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
                            isControlDisabled
                                ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                                : isControlling
                                  ? 'cursor-pointer bg-red-500 text-white hover:bg-red-600'
                                  : 'cursor-pointer bg-green-600 text-white hover:bg-green-700'
                        }`}
                    >
                        {isCalibrationLoading ? (
                            <Spinner color="white" />
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
            </div>
            <div
                className={`rounded-xl border px-4 py-3 ${
                    readiness.ready
                        ? 'border-emerald-400/40 bg-emerald-500/10'
                        : 'border-amber-400/40 bg-amber-500/10'
                }`}
            >
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                            readiness.ready
                                ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                                : 'border-amber-400/50 bg-amber-500/15 text-amber-100'
                        }`}
                    >
                        {readiness.ready ? <FaCheckCircle className="h-3.5 w-3.5" /> : <FaExclamationTriangle className="h-3.5 w-3.5" />}
                        {readiness.ready ? 'Ready to Teleoperate' : 'Finish Setup Before Starting'}
                    </span>
                    <span className="text-xs text-slate-300">
                        {readiness.ready
                            ? 'Everything needed for teleoperation is configured.'
                            : readinessMessage}
                    </span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {readiness.checks.map((check) => (
                        <div
                            key={check.key}
                            className={`rounded-lg border px-3 py-2 text-xs ${
                                check.ready
                                    ? 'border-emerald-500/30 bg-slate-900/40 text-emerald-100'
                                    : 'border-amber-500/30 bg-slate-900/40 text-amber-100'
                            }`}
                        >
                            <div className="font-semibold">{check.label}</div>
                            <div className={check.ready ? 'text-emerald-200/80' : 'text-amber-200/90'}>{check.detail}</div>
                        </div>
                    ))}
                </div>
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
