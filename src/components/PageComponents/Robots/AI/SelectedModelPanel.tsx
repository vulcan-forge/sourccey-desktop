'use client';

import { useEffect, useRef, useState } from 'react';
import { FaChevronDown, FaChevronUp, FaPlay, FaStop, FaTimes } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { RobotLogs } from '@/components/PageComponents/Robots/Logs/RobotDesktopLogs';
import { RemoteControlType, RemoteRobotStatus, setRemoteRobotState, useGetRemoteRobotState } from '@/hooks/Control/remote-control.hook';
import { Spinner } from '@/components/Elements/Spinner';

type SelectedModelPanelProps = {
    model: {
        id: string;
        name: string;
        model_path: string;
        model_path_relative?: string | null;
        latest_checkpoint: number;
    };
    ownedRobot: any;
    remoteConfig?: {
        remote_ip?: string;
        fps?: number;
        display_data?: boolean;
        record_rollout_data?: boolean;
    } | null;
    mode?: 'ai' | 'rollout';
    onClearAction: () => void;
};

export const SelectedModelPanel = ({ model, ownedRobot, remoteConfig, mode = 'ai', onClearAction }: SelectedModelPanelProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const [task, setTask] = useState('Fold the shirt');
    const [durationS, setDurationS] = useState('3600');
    const [modelPath, setModelPath] = useState(model.model_path);
    const [isRolloutSettingsOpen, setIsRolloutSettingsOpen] = useState(false);
    const [isRolloutStarting, setIsRolloutStarting] = useState(false);
    const [startupSeconds, setStartupSeconds] = useState(0);
    const startupListener = useRef<UnlistenFn | null>(null);

    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = nickname.startsWith('@') ? nickname.slice(1) : nickname;
    const isRolloutMode = mode === 'rollout';
    const { data: remoteRobotState }: any = useGetRemoteRobotState(nickname);
    const robotStatus = remoteRobotState?.status;
    const isControlling = remoteRobotState?.status === RemoteRobotStatus.STARTED && remoteRobotState?.controlType === RemoteControlType.ROLLOUT;

    useEffect(() => () => startupListener.current?.(), []);

    useEffect(() => {
        if (!isRolloutStarting) return;
        setStartupSeconds(0);
        const startedAt = Date.now();
        const timer = window.setInterval(() => setStartupSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
        return () => window.clearInterval(timer);
    }, [isRolloutStarting]);

    useEffect(() => {
        if (robotStatus === RemoteRobotStatus.NONE) {
            setIsRolloutStarting(false);
            startupListener.current?.();
            startupListener.current = null;
        }
    }, [robotStatus]);

    useEffect(() => {
        setIsLoading(false);
        setIsRolloutStarting(false);
        startupListener.current?.();
        startupListener.current = null;
    }, [model.id]);

    useEffect(() => {
        setModelPath(model.model_path);
    }, [model.model_path]);

    const isValidNumber = (value: string) => value.trim().length > 0 && !Number.isNaN(Number(value));
    const isValidDuration = isValidNumber(durationS) && Number(durationS) > 0;
    const isValidPath = modelPath.trim().length > 0;
    const isValidTask = task.trim().length > 0;

    const startRollout = async () => {
        if (isControlling || isRolloutStarting) {
            return;
        }
        if (!remoteConfig?.remote_ip) {
            toast.error('Remote IP is required.', { ...toastErrorDefaults });
            return;
        }
        if (!isValidPath) {
            toast.error('Model path is required.', { ...toastErrorDefaults });
            return;
        }
        if (!isValidTask) {
            toast.error('Task is required.', { ...toastErrorDefaults });
            return;
        }
        if (!isValidDuration) {
            toast.error('Duration must be greater than 0.', { ...toastErrorDefaults });
            return;
        }

        const remoteRolloutConfig: RemoteRolloutConfig = {
            nickname: normalizedNickname,
            remote_ip: remoteConfig.remote_ip,
            model_path: modelPath.trim(),
            task: task.trim(),
            duration: Number(durationS),
            display_data: remoteConfig.display_data ?? false,
            record_data: remoteConfig.record_rollout_data ?? true,
        };

        setIsRolloutStarting(true);
        setRemoteRobotState(nickname, RemoteRobotStatus.STARTING, RemoteControlType.ROLLOUT, ownedRobot);
        startupListener.current?.();
        startupListener.current = await listen<string>('rollout-log', ({ payload }) => {
            if (!payload.startsWith(`[${normalizedNickname}] `)) return;
            if (payload.includes('Rollout ready: control loop is running.')) {
                setIsRolloutStarting(false);
                setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.ROLLOUT, ownedRobot);
                toast.success('Rollout is ready.', { ...toastSuccessDefaults });
                startupListener.current?.();
                startupListener.current = null;
            }
        });
        await invoke('start_remote_rollout', { config: remoteRolloutConfig });
    };

    const stopRollout = async () => {
        if (!isControlling && !isRolloutStarting) {
            return;
        }
        const result = await invoke('stop_remote_rollout', { nickname: normalizedNickname });
        setIsRolloutStarting(false);
        startupListener.current?.();
        startupListener.current = null;
        toast.success(`Rollout stopped: ${result}`, { ...toastSuccessDefaults });
        setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
    };

    const toggleRollout = async () => {
        try {
            setIsLoading(true);
            if (isControlling || isRolloutStarting) {
                await stopRollout();
            } else {
                await startRollout();
            }
        } catch (error) {
            setIsRolloutStarting(false);
            startupListener.current?.();
            startupListener.current = null;
            console.error('Failed to toggle rollout:', error);
            toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`, {
                ...toastErrorDefaults,
            });
            setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="rounded-xl border border-amber-400/70 bg-amber-500/10 p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-base font-semibold text-white">{isRolloutMode ? 'Rollout' : model.name}</div>
                    <div className="mt-1 text-xs text-slate-300">
                        {isRolloutMode ? model.name : `Robot IP: ${remoteConfig?.remote_ip ?? 'unknown'}`}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsRolloutSettingsOpen((open) => !open)}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-400/70 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition-all duration-200 hover:border-amber-300/70 hover:bg-amber-500/20"
                    >
                        {isRolloutSettingsOpen ? <FaChevronUp className="h-3 w-3" /> : <FaChevronDown className="h-3 w-3" />}
                        Rollout Settings
                    </button>
                    <button
                        type="button"
                        onClick={onClearAction}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-amber-400/70 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition-all duration-200 hover:border-amber-300/70 hover:bg-amber-500/20"
                    >
                        <FaTimes className="h-3 w-3" />
                        Clear
                    </button>
                </div>
            </div>
            {isRolloutSettingsOpen && (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="flex flex-col gap-1 text-xs text-slate-200">
                        Path
                        <input
                            value={modelPath}
                            onChange={(event) => setModelPath(event.target.value)}
                            className="rounded-md border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-amber-400/70 focus:outline-none"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-slate-200">
                        Task
                        <input
                            value={task}
                            onChange={(event) => setTask(event.target.value)}
                            className="rounded-md border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-amber-400/70 focus:outline-none"
                            placeholder="Fold the shirt"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-slate-200">
                        Duration (s)
                        <input
                            value={durationS}
                            onChange={(event) => setDurationS(event.target.value)}
                            className="rounded-md border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-amber-400/70 focus:outline-none"
                        />
                    </label>
                </div>
            )}
            <div className="mt-5 flex items-center gap-3">
                <button
                    type="button"
                    onClick={toggleRollout}
                    disabled={isLoading}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-all ${
                        isControlling || isRolloutStarting
                            ? 'bg-red-500 hover:bg-red-600'
                            : 'bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 hover:from-red-500/90 hover:via-orange-500/90 hover:to-yellow-500/90'
                    }`}
                >
                    {isLoading ? (
                        <Spinner color="white" />
                    ) : isControlling || isRolloutStarting ? (
                        <FaStop className="h-3.5 w-3.5" />
                    ) : (
                        <FaPlay className="h-3.5 w-3.5" />
                    )}
                    {isLoading
                        ? isControlling
                            ? 'Saving rollout...'
                            : 'Working...'
                        : isRolloutStarting
                          ? 'Cancel startup'
                          : isControlling
                            ? 'Stop Rollout'
                            : 'Start Rollout'}
                </button>
            </div>

            {isRolloutStarting && (
                <div
                    role="status"
                    className="mt-4 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100"
                >
                    <Spinner color="white" />
                    <div>
                        <p className="text-sm font-semibold">Starting rollout... {startupSeconds}s</p>
                        <p className="mt-1 text-xs">
                            {(remoteConfig?.record_rollout_data ?? true)
                                ? 'Loading the model, connecting to the robot, and preparing the recorded episode.'
                                : 'Loading the model and connecting to the robot. Waiting for the rollout loop to start.'}
                        </p>
                        {startupSeconds >= 60 && (
                            <p className="mt-1 text-xs">Startup is taking longer than expected. Check the logs below, or cancel and retry.</p>
                        )}
                    </div>
                </div>
            )}

            <div className="mt-4">
                <RobotLogs isControlling={isControlling || isRolloutStarting} nickname={normalizedNickname} embedded={true} mode="rollout" />
            </div>
        </div>
    );
};

export interface RemoteRolloutConfig {
    nickname: string;
    remote_ip: string;
    model_path: string;
    task: string;
    duration: number;
    display_data: boolean;
    record_data: boolean;
}
