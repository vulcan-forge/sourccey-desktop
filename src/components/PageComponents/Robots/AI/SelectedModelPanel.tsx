'use client';

import { useEffect, useMemo, useState } from 'react';
import { FaPlay, FaStop, FaTimes } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { RobotLogs } from '@/components/PageComponents/Robots/Logs/RobotDesktopLogs';
import { RemoteControlType, RemoteRobotStatus, setRemoteRobotState, useGetRemoteRobotState } from '@/hooks/Control/remote-control.hook';

type SelectedModelPanelProps = {
    model: {
        id: string;
        name: string;
        model_path: string;
        model_path_relative: string;
        latest_checkpoint: number;
    };
    ownedRobot: any;
    remoteConfig?: {
        remote_ip?: string;
        fps?: number;
    } | null;
    onClearAction: () => void;
};

export const SelectedModelPanel = ({ model, ownedRobot, remoteConfig, onClearAction }: SelectedModelPanelProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const [task, setTask] = useState('Fold the shorts');
    const [episodeTimeS, setEpisodeTimeS] = useState('');
    const [fps, setFps] = useState('30');

    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = nickname.startsWith('@') ? nickname.slice(1) : nickname;
    const { data: remoteRobotState }: any = useGetRemoteRobotState(nickname);
    const isControlling =
        remoteRobotState?.status === RemoteRobotStatus.STARTED && remoteRobotState?.controlType === RemoteControlType.INFERENCE;

    useEffect(() => {
        setIsLoading(false);
    }, [model.id]);

    useEffect(() => {
        if (typeof remoteConfig?.fps === 'number') {
            setFps(String(remoteConfig.fps));
        }
    }, [remoteConfig?.fps]);

    const isValidNumber = (value: string) => value.trim().length > 0 && !Number.isNaN(Number(value));

    const episodeTimeValue = useMemo(() => {
        if (!episodeTimeS.trim()) {
            return null;
        }
        const parsed = Number(episodeTimeS);
        return Number.isFinite(parsed) ? parsed : null;
    }, [episodeTimeS]);

    const startInference = async () => {
        if (isControlling) {
            return;
        }
        if (!remoteConfig?.remote_ip) {
            toast.error('Remote IP is required.', { ...toastErrorDefaults });
            return;
        }
        if (!isValidNumber(fps)) {
            toast.error('FPS must be a valid number.', { ...toastErrorDefaults });
            return;
        }
        if (episodeTimeS.trim() && episodeTimeValue === null) {
            toast.error('Run time must be a valid number.', { ...toastErrorDefaults });
            return;
        }

        const remoteInferenceConfig: RemoteInferenceConfig = {
            nickname: normalizedNickname,
            remote_ip: remoteConfig.remote_ip,
            model_path: model.model_path_relative,
            single_task: task.trim() || 'Run inference',
            fps: Number(fps),
            episode_time_s: episodeTimeValue,
            display_data: true,
            display_ip: null,
            display_port: null,
            display_compressed_images: false,
        };

        const result = await invoke('start_remote_inference', { config: remoteInferenceConfig });
        toast.success(`Inference started: ${result}`, { ...toastSuccessDefaults });
        setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.INFERENCE, ownedRobot);
    };

    const stopInference = async () => {
        if (!isControlling) {
            return;
        }
        const result = await invoke('stop_remote_inference', { nickname: normalizedNickname });
        toast.success(`Inference stopped: ${result}`, { ...toastSuccessDefaults });
        setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
    };

    const toggleInference = async () => {
        try {
            setIsLoading(true);
            if (isControlling) {
                await stopInference();
            } else {
                await startInference();
            }
        } catch (error) {
            console.error('Failed to toggle inference:', error);
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
                    <div className="text-base font-semibold text-white">{model.name}</div>
                    <div className="mt-1 text-xs text-slate-300">Robot IP: {remoteConfig?.remote_ip ?? 'unknown'}</div>
                </div>
                <button
                    type="button"
                    onClick={onClearAction}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-amber-400/70 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition-all duration-200 hover:border-amber-300/70 hover:bg-amber-500/20"
                >
                    <FaTimes className="h-3 w-3" />
                    Clear
                </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs text-slate-200">
                    Task
                    <input
                        value={task}
                        onChange={(event) => setTask(event.target.value)}
                        className="rounded-md border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-amber-400/70 focus:outline-none"
                        placeholder="Fold the shorts"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-200">
                    Run Time (s)
                    <input
                        value={episodeTimeS}
                        onChange={(event) => setEpisodeTimeS(event.target.value)}
                        className="rounded-md border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-amber-400/70 focus:outline-none"
                        placeholder="Leave blank to run indefinitely"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-200">
                    FPS
                    <input
                        value={fps}
                        onChange={(event) => setFps(event.target.value)}
                        className="rounded-md border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-amber-400/70 focus:outline-none"
                        placeholder="30"
                    />
                </label>
            </div>
            <div className="mt-5 flex items-center gap-3">
                <button
                    type="button"
                    onClick={toggleInference}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-all ${
                        isControlling
                            ? 'bg-red-500 hover:bg-red-600'
                            : 'bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 hover:from-red-500/90 hover:via-orange-500/90 hover:to-yellow-500/90'
                    }`}
                >
                    {isLoading ? (
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/80 border-t-transparent"></div>
                    ) : isControlling ? (
                        <FaStop className="h-3.5 w-3.5" />
                    ) : (
                        <FaPlay className="h-3.5 w-3.5" />
                    )}
                    {isLoading ? 'Starting...' : isControlling ? 'Stop AI Model' : 'Run AI Model'}
                </button>
            </div>

            <div className="mt-4">
                <RobotLogs isControlling={isControlling} nickname={normalizedNickname} embedded={true} />
            </div>
        </div>
    );
};

export interface RemoteInferenceConfig {
    nickname: string;
    remote_ip: string;
    model_path: string;
    single_task: string;
    fps: number;
    episode_time_s: number | null;
    display_data: boolean;
    display_ip: string | null;
    display_port: number | null;
    display_compressed_images: boolean;
}
