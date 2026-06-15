import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { FaChevronDown, FaChevronUp, FaGamepad, FaPlay, FaStop } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import { RemoteControlType, RemoteRobotStatus, setRemoteRobotState, useGetRemoteRobotState } from '@/hooks/Control/remote-control.hook';
import { useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';
import { Spinner } from '@/components/Elements/Spinner';
import { DEFAULT_DESKTOP_TELEOP_TYPE, useDesktopTeleopCalibrationStatus } from '@/hooks/Control/desktop-calibration.hook';
import {
    getRemoteTeleopBlockingMessage,
    getRemoteTeleopReadiness,
} from '@/utils/teleop/remote-teleop-readiness';

export enum RobotControlStatus {
    STARTED = 'Robot is being controlled',
    STOPPED = 'Robot is not being controlled',
}

type RemoteTeleopMode = 'teleoperation' | 'recording';

type RemoteRecordDraft = {
    repoId: string;
    numEpisodes: string;
    episodeTimeS: string;
    resetTimeS: string;
    task: string;
};

const DEFAULT_RECORD_SETTINGS = {
    numEpisodes: '10',
    episodeTimeS: '300',
    resetTimeS: '5',
    task: 'Fold the shirt',
} satisfies Omit<RemoteRecordDraft, 'repoId'>;

export const RemoteTeleopAction = ({
    ownedRobot,
    onClose = () => {},
    mode = 'teleoperation',
    logsSlot,
}: {
    ownedRobot: any;
    onClose: () => void;
    mode?: RemoteTeleopMode;
    logsSlot?: React.ReactNode;
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isRecordSettingsOpen, setIsRecordSettingsOpen] = useState(false);

    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = nickname.startsWith('@') ? nickname.slice(1) : nickname;
    const isRecordingMode = mode === 'recording';
    const { data: remoteRobotState }: any = useGetRemoteRobotState(nickname);
    const { data: remoteConfig }: any = useGetRemoteConfig(nickname);
    const { data: teleopCalibrationStatus, isLoading: isLoadingCalibration }: any = useDesktopTeleopCalibrationStatus(
        normalizedNickname,
        DEFAULT_DESKTOP_TELEOP_TYPE,
        normalizedNickname.length > 0
    );

    const defaultRepoId = useMemo(() => {
        const baseName = ownedRobot?.robot?.name || ownedRobot?.nickname || 'sourccey';
        const slug = String(baseName)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        return `local/${slug || 'sourccey'}`;
    }, [ownedRobot]);

    const [recordSettings, setRecordSettings] = useState<RemoteRecordDraft>({
        repoId: defaultRepoId,
        ...DEFAULT_RECORD_SETTINGS,
    });

    useEffect(() => {
        setRecordSettings((current) => {
            if (current.repoId === defaultRepoId) {
                return current;
            }

            const currentValue = current.repoId.trim();
            if (!currentValue || currentValue.startsWith('local/')) {
                return { ...current, repoId: defaultRepoId };
            }

            return current;
        });
    }, [defaultRepoId]);

    const robotStatus = remoteRobotState?.status;
    const controlType = remoteRobotState?.controlType;
    const expectedControlType = isRecordingMode ? RemoteControlType.RECORDING : RemoteControlType.TELEOP;
    const isControlling = robotStatus == RemoteRobotStatus.STARTED && controlType == expectedControlType;
    const isCalibrationLoading = isLoading || isLoadingCalibration;
    const readiness = getRemoteTeleopReadiness(remoteConfig, teleopCalibrationStatus);
    const readinessMessage = getRemoteTeleopBlockingMessage(readiness);
    const panelTitle = isRecordingMode ? 'Record Data' : 'Teleoperate Robot';
    const startLabel = isRecordingMode ? 'Start Recording' : 'Start Control';
    const stopLabel = isRecordingMode ? 'Stop Recording' : 'Stop Control';

    const recordingDraftValidation = useMemo(() => {
        if (!isRecordingMode) {
            return { ready: true, message: '', parsed: null as ParsedRecordSettings | null };
        }

        const repoId = recordSettings.repoId.trim();
        const task = recordSettings.task.trim();
        const numEpisodes = Number(recordSettings.numEpisodes);
        const episodeTimeS = Number(recordSettings.episodeTimeS);
        const resetTimeS = Number(recordSettings.resetTimeS);

        if (!repoId) {
            return { ready: false, message: 'Record path is required.', parsed: null };
        }
        if (!Number.isFinite(numEpisodes) || numEpisodes <= 0) {
            return { ready: false, message: 'Episodes must be greater than 0.', parsed: null };
        }
        if (!Number.isFinite(episodeTimeS) || episodeTimeS <= 0) {
            return { ready: false, message: 'Episode time must be greater than 0.', parsed: null };
        }
        if (!Number.isFinite(resetTimeS) || resetTimeS < 0) {
            return { ready: false, message: 'Reset time must be 0 or greater.', parsed: null };
        }
        if (!task) {
            return { ready: false, message: 'Task is required.', parsed: null };
        }

        return {
            ready: true,
            message: '',
            parsed: {
                repoId,
                numEpisodes,
                episodeTimeS,
                resetTimeS,
                task,
            },
        };
    }, [isRecordingMode, recordSettings]);

    const effectiveReadinessMessage = !readiness.ready
        ? readinessMessage
        : !recordingDraftValidation.ready
          ? recordingDraftValidation.message
          : '';
    const isControlDisabled =
        isCalibrationLoading || !readiness.ready || (isRecordingMode && !recordingDraftValidation.ready);

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

    const startRecord = async (normalized: string) => {
        if (isControlling) {
            return;
        }

        if (!readiness.ready) {
            throw new Error(readinessMessage || 'Recording setup is incomplete.');
        }
        if (!recordingDraftValidation.ready || !recordingDraftValidation.parsed) {
            throw new Error(recordingDraftValidation.message || 'Recording settings are incomplete.');
        }

        const remoteRecordConfig: RemoteRecordConfig = {
            nickname: normalized,
            remote_ip: remoteConfig.remote_ip,
            left_arm_port: remoteConfig.left_arm_port,
            right_arm_port: remoteConfig.right_arm_port,
            keyboard: remoteConfig.keyboard,
            repo_id: recordingDraftValidation.parsed.repoId,
            num_episodes: recordingDraftValidation.parsed.numEpisodes,
            episode_time_s: recordingDraftValidation.parsed.episodeTimeS,
            reset_time_s: recordingDraftValidation.parsed.resetTimeS,
            single_task: recordingDraftValidation.parsed.task,
        };

        const result = await invoke('start_remote_record', { config: remoteRecordConfig });
        toast.success(`Recording started: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.RECORDING, ownedRobot);
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

    const stopRecord = async (normalized: string) => {
        if (!isControlling) {
            return;
        }

        const result = await invoke('stop_remote_record', { nickname: normalized });
        toast.success(`Recording stopped: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
        onClose();
    };

    const toggleControl = async () => {
        try {
            setIsLoading(true);
            if (isControlling) {
                if (isRecordingMode) {
                    await stopRecord(normalizedNickname);
                } else {
                    await stopTeleop(normalizedNickname);
                }
            } else {
                setRemoteRobotState(nickname, RemoteRobotStatus.STARTING, expectedControlType, ownedRobot);
                if (isRecordingMode) {
                    await startRecord(normalizedNickname);
                } else {
                    await startTeleop(normalizedNickname);
                }
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
        <div className="rounded-2xl border-2 border-slate-700/70 bg-slate-900/60 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.28)]">
            <div className="flex items-center justify-between gap-4">
                <h2 className="flex items-center gap-3 text-xl font-semibold text-white">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-300">
                        <FaGamepad className="h-5 w-5" />
                    </div>
                    <span>{panelTitle}</span>
                </h2>
                <div className="flex items-center gap-2">
                    {isRecordingMode && (
                        <button
                            type="button"
                            onClick={() => setIsRecordSettingsOpen((open) => !open)}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950/45 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-600 hover:bg-slate-900"
                        >
                            {isRecordSettingsOpen ? <FaChevronUp className="h-3.5 w-3.5" /> : <FaChevronDown className="h-3.5 w-3.5" />}
                            Record Settings
                        </button>
                    )}
                    <button
                        onClick={toggleControl}
                        disabled={isControlDisabled}
                        data-tooltip-id="teleop-control-tooltip"
                        data-tooltip-content={isControlDisabled ? effectiveReadinessMessage || 'Teleoperation setup is incomplete.' : ''}
                        className={`inline-flex min-w-44 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                            isControlDisabled
                                ? 'cursor-not-allowed bg-slate-600 text-slate-300 opacity-60'
                                : isControlling
                                  ? 'cursor-pointer bg-red-500 text-white hover:bg-red-600'
                                  : 'cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-400 hover:to-teal-400'
                        }`}
                    >
                        {isCalibrationLoading ? (
                            <Spinner color="white" />
                        ) : isControlling ? (
                            <>
                                <FaStop className="h-4 w-4" /> {stopLabel}
                            </>
                        ) : (
                            <>
                                <FaPlay className="h-4 w-4" /> {startLabel}
                            </>
                        )}
                    </button>
                </div>
            </div>
            {isRecordingMode && isRecordSettingsOpen && (
                <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-950/35 p-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Record Path
                            <input
                                value={recordSettings.repoId}
                                onChange={(event) => setRecordSettings((current) => ({ ...current, repoId: event.target.value }))}
                                className="rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Episodes
                            <input
                                value={recordSettings.numEpisodes}
                                onChange={(event) => setRecordSettings((current) => ({ ...current, numEpisodes: event.target.value }))}
                                className="rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Episode Time (s)
                            <input
                                value={recordSettings.episodeTimeS}
                                onChange={(event) => setRecordSettings((current) => ({ ...current, episodeTimeS: event.target.value }))}
                                className="rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Reset Time (s)
                            <input
                                value={recordSettings.resetTimeS}
                                onChange={(event) => setRecordSettings((current) => ({ ...current, resetTimeS: event.target.value }))}
                                className="rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Task
                            <input
                                value={recordSettings.task}
                                onChange={(event) => setRecordSettings((current) => ({ ...current, task: event.target.value }))}
                                className="rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                            />
                        </label>
                    </div>
                </div>
            )}
            <div className="mt-4">{logsSlot}</div>
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

type ParsedRecordSettings = {
    repoId: string;
    numEpisodes: number;
    episodeTimeS: number;
    resetTimeS: number;
    task: string;
};

export interface RemoteTeleopConfig {
    nickname: string;
    remote_ip: string;
    left_arm_port: string;
    right_arm_port: string;
    keyboard: string;
    fps: number;
}

export interface RemoteRecordConfig {
    nickname: string;
    remote_ip: string;
    left_arm_port: string;
    right_arm_port: string;
    keyboard: string;
    repo_id: string;
    num_episodes: number;
    episode_time_s: number;
    reset_time_s: number;
    single_task: string;
}

export const startRemoteControlText = {
    [RemoteControlType.TELEOP]: 'Start Control',
    [RemoteControlType.RECORDING]: 'Start Recording',
    [RemoteControlType.INFERENCE]: 'Start Inference',
};

export const stopRemoteControlText = {
    [RemoteControlType.TELEOP]: 'Stop Control',
    [RemoteControlType.RECORDING]: 'Stop Recording',
    [RemoteControlType.INFERENCE]: 'Stop Inference',
};
