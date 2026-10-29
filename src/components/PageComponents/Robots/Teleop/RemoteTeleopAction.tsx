import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { FaChevronDown, FaChevronUp, FaGamepad, FaPlay, FaStop } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import { RemoteControlType, RemoteRobotStatus, setRemoteRobotState, useGetRemoteRobotState } from '@/hooks/Control/remote-control.hook';
import { useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';
import { Spinner } from '@/components/Elements/Spinner';
import { DEFAULT_DESKTOP_TELEOP_TYPE, useDesktopTeleopCalibrationStatus } from '@/hooks/Control/desktop-calibration.hook';
import { getRemoteTeleopBlockingMessage, getRemoteTeleopReadiness } from '@/utils/teleop/remote-teleop-readiness';
import { buildDefaultRecordPath, isGeneratedRecordPath } from '@/utils/teleop/remote-record-path';
import { validateRecordSettings, type RemoteRecordDraft, type ParsedRecordSettings } from '@/utils/teleop/remote-record-settings';
import { setContent } from '@/hooks/Components/OwnedRobots/owned-robots.hook';

export enum RobotControlStatus {
    STARTED = 'Robot is being controlled',
    STOPPED = 'Robot is not being controlled',
}

type RemoteTeleopMode = 'teleoperation' | 'recording';

const DEFAULT_RECORD_SETTINGS = {
    namePattern: 'Sourccey-{Task}-{number}-{timestamp}',
    numEpisodes: '1',
    episodeTimeS: '600',
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
    const [isStoppingRecord, setIsStoppingRecord] = useState(false);
    const [isRecordSettingsOpen, setIsRecordSettingsOpen] = useState(false);
    const [vrHeadset, setVrHeadset] = useState(false);
    const [vrPreferenceLoaded, setVrPreferenceLoaded] = useState(false);
    const pressedTeleopKeys = useRef(new Set<string>());
    const startupListener = useRef<UnlistenFn | null>(null);
    const vrSettingsUpdate = useRef<Promise<void>>(Promise.resolve());
    const vrCaptureStartPending = useRef(false);
    const vrCaptureStopPending = useRef(false);
    const [isControlStarting, setIsControlStarting] = useState(false);
    const [isVrReceiverReady, setIsVrReceiverReady] = useState(false);
    const [isVrHeadsetReady, setIsVrHeadsetReady] = useState(false);
    const [isVrCaptureReady, setIsVrCaptureReady] = useState(false);
    const [isVrCaptureStarting, setIsVrCaptureStarting] = useState(false);
    const [isVrCaptureActive, setIsVrCaptureActive] = useState(false);
    const [isVrHeadsetStopping, setIsVrHeadsetStopping] = useState(false);
    const [isVrRerecording, setIsVrRerecording] = useState(false);
    const [recordingHostIp, setRecordingHostIp] = useState('');
    const [startupSeconds, setStartupSeconds] = useState(0);

    useEffect(
        () => () => {
            startupListener.current?.();
        },
        []
    );
    useEffect(() => {
        if (!isControlStarting) return;
        setStartupSeconds(0);
        const startedAt = Date.now();
        const timer = window.setInterval(() => setStartupSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
        return () => window.clearInterval(timer);
    }, [isControlStarting]);

    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = nickname.startsWith('@') ? nickname.slice(1) : nickname;
    const isRecordingMode = mode === 'recording';
    const vrPreferenceKey = `record-data-vr-headset:${normalizedNickname}`;
    useEffect(() => {
        if (!isRecordingMode) return;
        try {
            setVrHeadset(window.localStorage.getItem(vrPreferenceKey) === 'true');
        } catch {
            setVrHeadset(false);
        } finally {
            setVrPreferenceLoaded(true);
        }
    }, [isRecordingMode, vrPreferenceKey]);
    const { data: remoteRobotState }: any = useGetRemoteRobotState(nickname);
    const { data: remoteConfig }: any = useGetRemoteConfig(nickname);
    const { data: teleopCalibrationStatus, isLoading: isLoadingCalibration }: any = useDesktopTeleopCalibrationStatus(
        normalizedNickname,
        DEFAULT_DESKTOP_TELEOP_TYPE,
        normalizedNickname.length > 0 && (!isRecordingMode || !vrHeadset)
    );

    const defaultRepoId = useMemo(() => {
        return buildDefaultRecordPath(ownedRobot?.robot?.name, ownedRobot?.nickname);
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
            if (!currentValue || isGeneratedRecordPath(currentValue)) {
                return { ...current, repoId: defaultRepoId };
            }

            return current;
        });
    }, [defaultRepoId]);

    const robotStatus = remoteRobotState?.status;
    const controlType = remoteRobotState?.controlType;
    const expectedControlType = isRecordingMode ? RemoteControlType.RECORDING : RemoteControlType.TELEOP;
    const isControlling = robotStatus == RemoteRobotStatus.STARTED && controlType == expectedControlType;
    useEffect(() => {
        if (robotStatus === RemoteRobotStatus.NONE) {
            setIsControlStarting(false);
            startupListener.current?.();
            startupListener.current = null;
        }
    }, [robotStatus]);

    useEffect(() => {
        if (!isControlling) return;

        const supportedKeys = new Set([
            'w',
            'a',
            's',
            'd',
            'q',
            'e',
            'z',
            'x',
            'r',
            'f',
            'n',
            'm',
            'space',
            'arrowleft',
            'arrowright',
            'escape',
        ]);
        const normalizeKey = (key: string) => (key === ' ' ? 'space' : key.toLowerCase());
        const publish = () => {
            void invoke('set_remote_teleop_keys', {
                nickname: normalizedNickname,
                keys: Array.from(pressedTeleopKeys.current),
            });
        };
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
            const key = normalizeKey(event.key);
            if (!supportedKeys.has(key)) return;
            event.preventDefault();
            if (!pressedTeleopKeys.current.has(key)) {
                pressedTeleopKeys.current.add(key);
                publish();
            }
        };
        const onKeyUp = (event: KeyboardEvent) => {
            const key = normalizeKey(event.key);
            if (!supportedKeys.has(key)) return;
            event.preventDefault();
            if (pressedTeleopKeys.current.delete(key)) publish();
        };
        const clearKeys = () => {
            if (pressedTeleopKeys.current.size === 0) return;
            pressedTeleopKeys.current.clear();
            publish();
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', clearKeys);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', clearKeys);
            clearKeys();
        };
    }, [isControlling, normalizedNickname]);
    const vrRecording = isRecordingMode && vrHeadset;
    const isCalibrationLoading = isLoading || (isLoadingCalibration && !vrRecording);
    const readiness = getRemoteTeleopReadiness(remoteConfig, teleopCalibrationStatus, {
        allowLeaderFallback: true,
    });
    const vrSession = vrRecording;
    const vrReady = Boolean(remoteConfig?.remote_ip?.trim());
    useEffect(() => {
        if (!vrRecording || !vrReady) {
            setRecordingHostIp('');
            return;
        }
        let active = true;
        void invoke<string>('get_recording_host_ip', { remoteIp: remoteConfig.remote_ip })
            .then((address) => { if (active) setRecordingHostIp(address); })
            .catch(() => { if (active) setRecordingHostIp(''); });
        return () => { active = false; };
    }, [vrRecording, vrReady, remoteConfig?.remote_ip]);
    const readinessMessage = vrSession ? 'Robot host or IP address is required.' : getRemoteTeleopBlockingMessage(readiness);
    const panelTitle = isRecordingMode ? 'Record Data' : 'Teleoperate Robot';
    const startLabel = vrRecording ? 'Open Recording Teleoperation Connection' : isRecordingMode ? 'Start Recording' : 'Start Control';
    const stopLabel = vrRecording ? (isVrCaptureActive ? 'Stop Recording' : 'Close Recording Connection') : isRecordingMode ? 'Stop Recording' : 'Stop Control';
    const arePortsMissing = !remoteConfig?.left_arm_port?.trim() || !remoteConfig?.right_arm_port?.trim();
    const isTeleopCalibrated = teleopCalibrationStatus?.isCalibrated === true;
    const shouldUseLeaderFallback = arePortsMissing || !isTeleopCalibrated;
    const showLeaderFallbackNotice = shouldUseLeaderFallback && !vrSession;
    const operationLabel = isRecordingMode ? 'Recording' : 'Teleop';
    const leaderFallbackNotice =
        arePortsMissing && !isTeleopCalibrated
            ? `No teleoperator ports or desktop teleop calibration file were found. ${operationLabel} will still start, but the arms will be down to the side. Go to Setup to add teleop arm ports and run calibration.`
            : arePortsMissing
              ? `No teleoperator ports were found. ${operationLabel} will still start, but the arms will be down to the side. Go to Setup to add teleop arm ports.`
              : `No desktop teleop calibration file was found. ${operationLabel} will still start, but the arms will be down to the side until calibration is completed.`;

    const recordingDraftValidation = useMemo(() => {
        if (!isRecordingMode) {
            return { ready: true, message: '', parsed: null as ParsedRecordSettings | null };
        }

        return validateRecordSettings(recordSettings);
    }, [isRecordingMode, recordSettings]);

    const vrBatchSettings = useMemo(() => {
        const parsed = recordingDraftValidation.parsed;
        return parsed ? {
            repo_id: parsed.repoId,
            name_pattern: parsed.namePattern,
            num_episodes: parsed.numEpisodes,
            episode_time_s: parsed.episodeTimeS,
            reset_time_s: parsed.resetTimeS,
            single_task: parsed.task,
        } : null;
    }, [recordingDraftValidation]);

    useEffect(() => {
        if (!vrRecording || !isControlling || !isVrReceiverReady) return;
        const update = vrSettingsUpdate.current.then(() => invoke<void>('update_vr_record_settings', {
            nickname: normalizedNickname, settings: vrBatchSettings,
        }));
        vrSettingsUpdate.current = update.catch(() => {});
        void update.catch((error) => {
            toast.error(`Could not update recording settings: ${error instanceof Error ? error.message : String(error)}`, { ...toastErrorDefaults });
        });
    }, [vrRecording, isControlling, isVrReceiverReady, normalizedNickname, vrBatchSettings]);

    const effectiveReadinessMessage = !(vrSession ? vrReady : readiness.ready)
        ? readinessMessage
        : !recordingDraftValidation.ready
          ? recordingDraftValidation.message
          : '';
    const isControlDisabled =
        isLoading ||
        isStoppingRecord ||
        isVrCaptureStarting ||
        isVrHeadsetStopping ||
        (isRecordingMode && !vrPreferenceLoaded) ||
        (!(isControlling || isControlStarting) &&
            ((isLoadingCalibration && !vrSession) || !(vrSession ? vrReady : readiness.ready) || (isRecordingMode && !recordingDraftValidation.ready)));

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
            left_arm_port: shouldUseLeaderFallback ? '' : remoteConfig.left_arm_port,
            right_arm_port: shouldUseLeaderFallback ? '' : remoteConfig.right_arm_port,
            keyboard: remoteConfig.keyboard,
            fps: remoteConfig.fps,
            display_data: remoteConfig.display_data ?? false,
        };

        setIsControlStarting(true);
        startupListener.current?.();
        startupListener.current = await listen<string>('teleop-log', ({ payload }) => {
            if (!payload.startsWith(`[${normalized}] `)) return;
            if (payload.includes('Teleop ready: control loop is running.')) {
                setIsControlStarting(false);
                setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.TELEOP, ownedRobot);
                toast.success('Teleop is ready.', { ...toastSuccessDefaults });
                startupListener.current?.();
                startupListener.current = null;
            }
        });
        await invoke('start_remote_teleop', { config: remoteTeleopConfig });
    };

    const startRecord = async (normalized: string) => {
        if (isControlling) {
            return;
        }

        if (!(vrSession ? vrReady : readiness.ready)) {
            throw new Error(readinessMessage || 'Recording setup is incomplete.');
        }
        if (!recordingDraftValidation.ready || !recordingDraftValidation.parsed) {
            throw new Error(recordingDraftValidation.message || 'Recording settings are incomplete.');
        }

        const remoteRecordConfig: RemoteRecordConfig = {
            robot_id: ownedRobot?.id,
            nickname: normalized,
            remote_ip: remoteConfig.remote_ip,
            left_arm_port: shouldUseLeaderFallback ? '' : remoteConfig.left_arm_port,
            right_arm_port: shouldUseLeaderFallback ? '' : remoteConfig.right_arm_port,
            keyboard: vrRecording ? remoteConfig.keyboard || 'keyboard' : remoteConfig.keyboard,
            repo_id: recordingDraftValidation.parsed.repoId,
            name_pattern: recordingDraftValidation.parsed.namePattern,
            num_episodes: recordingDraftValidation.parsed.numEpisodes,
            episode_time_s: recordingDraftValidation.parsed.episodeTimeS,
            reset_time_s: recordingDraftValidation.parsed.resetTimeS,
            single_task: recordingDraftValidation.parsed.task,
            vr_headset: vrRecording,
            display_data: remoteConfig.display_data ?? false,
        };

        setIsVrReceiverReady(false);
        setIsVrHeadsetReady(false);
        setIsVrCaptureReady(false);
        setIsVrCaptureActive(false);
        setIsVrHeadsetStopping(false);
        setIsVrRerecording(false);
        vrCaptureStartPending.current = false;
        vrCaptureStopPending.current = false;
        setIsControlStarting(true);
        startupListener.current?.();
        startupListener.current = await listen<string>('record-log', ({ payload }) => {
            if (!payload.startsWith(`[${normalized}] `)) return;
            if (vrRecording && payload.includes('VR receiver ready; waiting for headset controls')) {
                setIsVrReceiverReady(true);
                setIsControlStarting(false);
                setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.RECORDING, ownedRobot);
            }
            if (vrRecording && payload.includes('VR headset connected; teleoperation ready')) {
                setIsVrHeadsetReady(true);
            }
            if (vrRecording && payload.includes('VR headset controls stale; waiting for headset')) {
                setIsVrHeadsetReady(false);
                setIsVrCaptureReady(false);
            }
            if (vrRecording && payload.includes('VR capture ready; teleoperation live')) {
                setIsVrCaptureReady(true);
            }
            if (vrRecording && payload.includes('VR capture not ready; waiting for headset controls')) {
                setIsVrCaptureReady(false);
            }
            if (vrRecording && payload.includes('VR headset requested recording start')) {
                vrCaptureStartPending.current = true;
                setIsVrCaptureReady(false);
                setIsVrCaptureStarting(true);
            }
            if (vrRecording && (payload.includes('VR headset requested recording stop') || payload.includes('VR capture stopping:'))) {
                vrCaptureStopPending.current = true;
                setIsVrHeadsetStopping(true);
            }
            if (vrRecording && payload.includes('VR capture stopped; saving recorded video')) {
                setIsVrCaptureActive(false);
                setIsVrHeadsetStopping(true);
                setIsVrRerecording(false);
            }
            if (vrRecording && payload.includes('VR capture continuing; reset the environment')) {
                vrCaptureStopPending.current = false;
                setIsVrHeadsetStopping(false);
                setIsVrCaptureActive(false);
                setIsVrCaptureReady(false);
            }
            if (vrRecording && payload.includes('VR recording idle; teleoperation ready')) {
                vrCaptureStopPending.current = false;
                setIsVrHeadsetStopping(false);
            }
            if (vrRecording && payload.includes('VR capture saved: ')) {
                vrCaptureStartPending.current = false;
                vrCaptureStopPending.current = false;
                setIsVrCaptureReady(false);
                setIsVrCaptureStarting(false);
                setIsVrCaptureActive(false);
                setIsVrHeadsetStopping(false);
                setIsVrRerecording(false);
                toast.success('Recording saved. Waiting for live headset controls before the next capture.', { ...toastSuccessDefaults });
            }
            if (vrRecording && payload.includes('VR headset requested episode rerecord')) {
                setIsVrRerecording(true);
            }
            if (vrRecording && payload.includes('VR capture started: ')) {
                setIsVrRerecording(false);
                setIsVrCaptureActive(true);
                setIsVrHeadsetStopping(false);
            }
            if (payload.includes('Recording ready: capture loop is running.')) {
                vrCaptureStartPending.current = false;
                setIsControlStarting(false);
                setIsVrCaptureStarting(false);
                if (vrRecording) setIsVrCaptureActive(true);
                setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.RECORDING, ownedRobot);
                toast.success('Recording is ready.', { ...toastSuccessDefaults });
                if (!vrRecording) {
                    startupListener.current?.();
                    startupListener.current = null;
                }
            }
            if (vrRecording && payload.includes('Record process terminated')) {
                vrCaptureStartPending.current = false;
                vrCaptureStopPending.current = false;
                setIsVrCaptureReady(false);
                setIsVrReceiverReady(false);
                setIsVrHeadsetReady(false);
                setIsVrCaptureStarting(false);
                setIsVrCaptureActive(false);
                setIsVrHeadsetStopping(false);
                setIsVrRerecording(false);
                setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
                startupListener.current?.();
                startupListener.current = null;
            }
        });
        await invoke('start_remote_record', { config: remoteRecordConfig });
    };

    const beginVrRecording = async () => {
        if (!vrRecording || !isControlling || !isVrReceiverReady || !isVrHeadsetReady || !isVrCaptureReady || isVrCaptureStarting || isVrCaptureActive || vrCaptureStartPending.current) return;
        if (!vrBatchSettings) {
            toast.error(recordingDraftValidation.message || 'Recording settings are required.', { ...toastErrorDefaults });
            return;
        }
        vrCaptureStartPending.current = true;
        setIsVrCaptureStarting(true);
        setIsVrCaptureReady(false);
        const requestedAtMs = Date.now();
        try {
            await vrSettingsUpdate.current;
            await invoke('begin_vr_record', { nickname: normalizedNickname, settings: vrBatchSettings, requestedAtMs });
        } catch (error) {
            vrCaptureStartPending.current = false;
            setIsVrCaptureStarting(false);
            if (!String(error).includes('Recording is still saving or waiting for live headset controls.')) {
                setIsVrCaptureReady(true);
            }
            toast.error(`Could not start recording: ${error instanceof Error ? error.message : String(error)}`, { ...toastErrorDefaults });
        }
    };

    const stopVrCapture = async () => {
        if (!vrRecording || !isControlling || isVrHeadsetStopping || vrCaptureStopPending.current) return;
        vrCaptureStopPending.current = true;
        setIsVrHeadsetStopping(true);
        try {
            await invoke('stop_vr_capture', { nickname: normalizedNickname });
        } catch (error) {
            vrCaptureStopPending.current = false;
            setIsVrHeadsetStopping(false);
            toast.error(`Could not stop recording: ${error instanceof Error ? error.message : String(error)}`, { ...toastErrorDefaults });
        }
    };

    const stopTeleop = async (normalized: string) => {
        if (!isControlling && !isControlStarting) {
            return;
        }

        const result = await invoke('stop_remote_teleop', { nickname: normalized });
        setIsControlStarting(false);
        startupListener.current?.();
        startupListener.current = null;
        toast.success(`Remote Teleop stopped: ${result}`, {
            ...toastSuccessDefaults,
        });
        setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
        onClose();
    };

    const stopRecord = async (normalized: string) => {
        if (!isControlling && !isControlStarting) {
            return;
        }

        setIsStoppingRecord(true);
        let resolveFinalized: () => void = () => {};
        const finalized = new Promise<void>((resolve) => {
            resolveFinalized = resolve;
        });
        const stopListener = await listen<{ nickname: string }>('record-process-finalized', ({ payload }) => {
            if (payload.nickname === normalized) resolveFinalized();
        });

        try {
            const result = await invoke<string>('stop_remote_record', { nickname: normalized });
            if (result.includes('stop requested')) {
                await Promise.race([
                    finalized,
                    new Promise<never>((_, reject) =>
                        window.setTimeout(() => reject(new Error('Recording took too long to finish saving. Check the record logs.')), 35_000)
                    ),
                ]);
            }
            setIsControlStarting(false);
            setIsVrReceiverReady(false);
            setIsVrHeadsetReady(false);
            setIsVrCaptureStarting(false);
            setIsVrCaptureActive(false);
            setIsVrHeadsetStopping(false);
            setIsVrRerecording(false);
            startupListener.current?.();
            startupListener.current = null;
            toast.success(vrRecording && !isVrCaptureActive ? 'Recording connection closed.' : 'Recording stopped and saved.', { ...toastSuccessDefaults });
            setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
            onClose();
        } finally {
            stopListener();
            setIsStoppingRecord(false);
        }
    };

    const toggleControl = async () => {
        if (isStoppingRecord || isVrCaptureStarting || isVrHeadsetStopping || vrCaptureStartPending.current || vrCaptureStopPending.current) return;
        try {
            setIsLoading(true);
            if (isControlling || isControlStarting) {
                if (isRecordingMode) {
                    if (vrRecording && isVrCaptureActive) {
                        await stopVrCapture();
                    } else {
                        await stopRecord(normalizedNickname);
                    }
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
            setIsControlStarting(false);
            setIsVrReceiverReady(false);
            setIsVrHeadsetReady(false);
            setIsVrCaptureStarting(false);
            setIsVrCaptureActive(false);
            setIsVrHeadsetStopping(false);
            setIsVrRerecording(false);
            startupListener.current?.();
            startupListener.current = null;
            console.error('Failed to toggle control:', error);
            toast.error(`Error: ${error instanceof Error ? error.message : String(error || 'Unknown error occurred')}`, {
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
                        aria-busy={isStoppingRecord || isVrHeadsetStopping}
                        data-tooltip-id="teleop-control-tooltip"
                        data-tooltip-content={isStoppingRecord || isVrHeadsetStopping ? 'Saving recording...' : isVrCaptureStarting ? 'Starting recording...' : isControlDisabled ? effectiveReadinessMessage || 'Teleoperation setup is incomplete.' : ''}
                        className={`inline-flex min-w-44 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                            isStoppingRecord || isVrHeadsetStopping
                                ? 'cursor-wait bg-blue-600 text-white'
                                : isControlDisabled
                                ? 'cursor-not-allowed bg-slate-600 text-slate-300 opacity-60'
                                : isControlling || isControlStarting
                                  ? 'cursor-pointer bg-red-500 text-white hover:bg-red-600'
                                  : 'cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-400 hover:to-teal-400'
                        }`}
                    >
                        {isStoppingRecord || isVrHeadsetStopping ? (
                            <>
                                <Spinner color="white" /> Saving Recording...
                            </>
                        ) : isCalibrationLoading ? (
                            <Spinner color="white" />
                        ) : isControlling || isControlStarting ? (
                            <>
                                <FaStop className="h-4 w-4" /> {isControlStarting ? 'Cancel startup' : stopLabel}
                            </>
                        ) : (
                            <>
                                <FaPlay className="h-4 w-4" /> {startLabel}
                            </>
                        )}
                    </button>
                    {vrRecording && isControlling && isVrReceiverReady && !isVrCaptureActive && !isVrHeadsetStopping && !isLoading && (isVrCaptureStarting || (isVrHeadsetReady && isVrCaptureReady)) && (
                        <button
                            type="button"
                            onClick={beginVrRecording}
                            disabled={isVrCaptureStarting || !vrBatchSettings}
                            aria-busy={isVrCaptureStarting}
                            className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white ${
                                isVrCaptureStarting
                                    ? 'cursor-wait bg-blue-600'
                                    : 'cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400'
                            }`}
                        >
                            {isVrCaptureStarting ? <><Spinner color="white" /> Starting Recording...</> : <><FaPlay className="h-4 w-4" /> Start Recording</>}
                        </button>
                    )}
                </div>
            </div>
            {vrRecording && (
                <div className="mt-4 rounded-xl border border-sky-500/40 bg-sky-500/10 p-4 text-sm text-sky-100">
                    Headset recording destination: <strong className="text-white">{recordingHostIp || 'desktop LAN IP'}:5557</strong>.
                    {' '}Use this desktop address in the headset’s Recording Mode; {remoteConfig?.remote_ip} is the robot address for direct control.
                    {' '}Enable Recording Buttons in the headset settings: green starts capture, red saves and returns to teleoperation, and blue rerecords the current episode.
                </div>
            )}
            {isStoppingRecord && (
                <div
                    role="status"
                    className="mt-4 flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-blue-100"
                >
                    <Spinner color="white" />
                    <div>
                        <p className="text-sm font-semibold">{vrRecording && !isVrCaptureActive ? 'Closing recording connection...' : 'Stopping recording and saving the dataset...'}</p>
                        <p className="mt-1 text-xs">{vrRecording && !isVrCaptureActive ? 'Disconnecting the desktop from the robot and headset.' : 'Finalizing frames and video files. Keep Vulcan Studio open until this finishes.'}</p>
                    </div>
                </div>
            )}
            {isControlStarting && (
                <div
                    role="status"
                    className="mt-4 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100"
                >
                    <Spinner color="white" />
                    <div>
                        <p className="text-sm font-semibold">
                            {vrRecording && isVrReceiverReady ? 'Waiting for headset controls' : `Starting ${vrRecording ? 'recording teleoperation' : isRecordingMode ? 'recording' : 'teleop'}... ${startupSeconds}s`}
                        </p>
                        <p className="mt-1 text-xs">
                            {vrRecording && isVrReceiverReady
                                ? 'The receiver is connected to the robot. Connect the headset, then press Start Recording when ready.'
                                : `Loading the runtime and connecting to the robot. Waiting for the ${isRecordingMode ? 'capture' : 'control'} loop to start.`}
                        </p>
                        {startupSeconds >= 60 && !isVrReceiverReady && (
                            <p className="mt-1 text-xs">Startup is taking longer than expected. Check the logs below, or cancel and retry.</p>
                        )}
                    </div>
                </div>
            )}
            {showLeaderFallbackNotice && (
                <div className="mt-4 rounded-2xl border border-sky-500/40 bg-sky-500/10 p-4">
                    <div className="text-sm font-semibold text-sky-100">Leader arms in fallback mode</div>
                    <p className="mt-1 text-xs text-sky-100/90">{leaderFallbackNotice}</p>
                    <button
                        type="button"
                        onClick={() => setContent('calibration')}
                        className="mt-3 cursor-pointer rounded-lg border border-sky-400/60 bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-50 transition hover:bg-sky-500/30"
                    >
                        Set Up Teleoperator
                    </button>
                </div>
            )}
            {isRecordingMode && isControlling && !vrRecording && (
                <div className="mt-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                    <div className="text-sm font-semibold text-emerald-100">Recording keyboard controls</div>
                    <p className="mt-1 text-xs text-emerald-100/90">
                        Press the left arrow key to reset the current run without saving. Press the right arrow key to stop the recording and
                        save it.
                    </p>
                </div>
            )}
            {vrRecording && isVrRerecording && (
                <p className="mt-4 rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 text-sm text-blue-100" role="status">
                    Re-recording the current episode. The desktop is discarding its unsaved frames and resetting the environment.
                </p>
            )}
            {vrRecording && isVrHeadsetStopping && (
                <p className="mt-4 rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 text-sm text-blue-100" role="status">
                    Saving the current episode. Teleoperation will stay connected.
                </p>
            )}
            {vrRecording && isVrReceiverReady && !isVrCaptureActive && !isControlStarting && (
                <p className="mt-4 text-sm text-slate-200" role="status">
                    {isVrCaptureStarting
                        ? 'Starting capture. The start cue will play when the first frame is recorded.'
                        : isVrCaptureReady
                        ? 'Headset controls are moving the robot. Position it, then press Start Recording.'
                        : isVrHeadsetReady
                          ? 'Preparing the next capture. Start Recording will appear when live controls resume.'
                          : 'Recording teleoperation is open. Connect the headset to this computer to enable Start Recording.'}
                </p>
            )}
            {isRecordingMode && isRecordSettingsOpen && (
                <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-950/35 p-4">
                    <label className="mb-4 flex items-center gap-2 text-sm text-slate-100">
                        <input type="checkbox" checked={vrHeadset} onChange={(event) => {
                            const enabled = event.target.checked;
                            setVrHeadset(enabled);
                            try { window.localStorage.setItem(vrPreferenceKey, String(enabled)); } catch { /* Storage may be unavailable. */ }
                        }} disabled={isControlling || isControlStarting || !vrPreferenceLoaded} />
                        Use VR headset for teleoperative recording
                    </label>
                    {vrHeadset && <p className="mb-4 text-xs text-slate-300">Open Recording Teleoperation Connection to control the robot before capture. On the headset, turn on Recording Mode and set its IP address to <strong className="text-white">{recordingHostIp || 'this desktop computer’s LAN IP'}</strong>, command port 5557 and observation port 5561. The robot’s IP ({remoteConfig?.remote_ip}) is for direct control. Start Recording becomes available when live headset controls arrive.</p>}
                    {vrRecording && isControlling && <p className="mb-4 text-xs text-slate-300">Settings changes apply to the next recording batch. The current batch keeps its original settings.</p>}
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Record Path
                            <input
                                value={recordSettings.repoId}
                                onChange={(event) => setRecordSettings((current) => ({ ...current, repoId: event.target.value }))}
                                className="rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-300 md:col-span-2">
                            Dataset Name Pattern
                            <input
                                value={recordSettings.namePattern}
                                onChange={(event) => setRecordSettings((current) => ({ ...current, namePattern: event.target.value }))}
                                aria-label="Dataset Name Pattern"
                                className="rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                            />
                            <span>Use {'{Task}'}, {'{number}'} (001, 002, …), and {'{timestamp}'}.</span>
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

export interface RemoteTeleopConfig {
    nickname: string;
    remote_ip: string;
    left_arm_port: string;
    right_arm_port: string;
    keyboard: string;
    fps: number;
    display_data: boolean;
}

export interface RemoteRecordConfig {
    robot_id: string;
    nickname: string;
    remote_ip: string;
    left_arm_port: string;
    right_arm_port: string;
    keyboard: string;
    repo_id: string;
    name_pattern: string;
    num_episodes: number;
    episode_time_s: number;
    reset_time_s: number;
    single_task: string;
    vr_headset: boolean;
    display_data: boolean;
}

export const startRemoteControlText = {
    [RemoteControlType.TELEOP]: 'Start Control',
    [RemoteControlType.RECORDING]: 'Start Recording',
    [RemoteControlType.REPLAY]: 'Start Replay',
    [RemoteControlType.INFERENCE]: 'Start Inference',
};

export const stopRemoteControlText = {
    [RemoteControlType.TELEOP]: 'Stop Control',
    [RemoteControlType.RECORDING]: 'Stop Recording',
    [RemoteControlType.REPLAY]: 'Stop Replay',
    [RemoteControlType.INFERENCE]: 'Stop Inference',
};
