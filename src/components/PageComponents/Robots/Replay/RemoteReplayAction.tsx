'use client';

import { Spinner } from '@/components/Elements/Spinner';
import { RobotLogs } from '@/components/PageComponents/Robots/Logs/RobotDesktopLogs';
import { useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';
import { RemoteControlType, RemoteRobotStatus, setRemoteRobotState, useGetRemoteRobotState } from '@/hooks/Control/remote-control.hook';
import { buildDefaultRecordPath, isGeneratedRecordPath } from '@/utils/teleop/remote-record-path';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaChevronDown, FaChevronUp, FaFolderOpen, FaPlay, FaPlayCircle, FaRedo, FaStop } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { Tooltip } from 'react-tooltip';

type ReplayDraft = { repoId: string; root: string; episode: string; fps: string; playSounds: boolean };
type ReplayDataset = { name: string; repoId: string; path: string; totalEpisodes: number; totalFrames: number };
type RemoteReplayConfig = {
    nickname: string;
    remote_ip: string;
    repo_id: string;
    root: string | null;
    episode: number;
    fps: number;
    play_sounds: boolean;
};

export const RemoteReplayAction = ({ ownedRobot }: { ownedRobot: any }) => {
    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = nickname.startsWith('@') ? nickname.slice(1) : nickname;
    const defaultRepoId = useMemo(() => buildDefaultRecordPath(ownedRobot?.robot?.name, ownedRobot?.nickname), [ownedRobot]);
    const [draft, setDraft] = useState<ReplayDraft>({ repoId: defaultRepoId, root: '', episode: '0', fps: '30', playSounds: true });
    const [datasets, setDatasets] = useState<ReplayDataset[]>([]);
    const [isDiscovering, setIsDiscovering] = useState(true);
    const [discoveryError, setDiscoveryError] = useState('');
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [startupSeconds, setStartupSeconds] = useState(0);
    const startupListener = useRef<UnlistenFn | null>(null);
    const { data: remoteConfig }: any = useGetRemoteConfig(nickname);
    const { data: remoteRobotState }: any = useGetRemoteRobotState(nickname);

    const isReplaying = remoteRobotState?.status === RemoteRobotStatus.STARTED && remoteRobotState?.controlType === RemoteControlType.REPLAY;
    const isAnotherControlActive =
        remoteRobotState?.status !== RemoteRobotStatus.NONE && remoteRobotState?.controlType !== RemoteControlType.REPLAY;
    const controlsLocked = isReplaying || isStarting;

    const discoverDatasets = useCallback(async () => {
        setIsDiscovering(true);
        setDiscoveryError('');
        try {
            const discovered = await invoke<ReplayDataset[]>('discover_replay_datasets');
            setDatasets(discovered);
            setDraft((current) => {
                if (discovered.some((dataset) => dataset.repoId === current.repoId)) return current;
                const preferred = discovered.find((dataset) => dataset.repoId === defaultRepoId) ?? discovered[0];
                return preferred ? { ...current, repoId: preferred.repoId } : current;
            });
        } catch (error) {
            setDiscoveryError(error instanceof Error ? error.message : String(error));
        } finally {
            setIsDiscovering(false);
        }
    }, [defaultRepoId]);

    useEffect(() => {
        void discoverDatasets();
    }, [discoverDatasets]);
    useEffect(() => () => startupListener.current?.(), []);
    useEffect(() => {
        setDraft((current) => {
            const currentValue = current.repoId.trim();
            return !currentValue || isGeneratedRecordPath(currentValue) ? { ...current, repoId: defaultRepoId } : current;
        });
    }, [defaultRepoId]);
    useEffect(() => {
        if (!isStarting) return;
        setStartupSeconds(0);
        const startedAt = Date.now();
        const timer = window.setInterval(() => setStartupSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
        return () => window.clearInterval(timer);
    }, [isStarting]);
    useEffect(() => {
        if (remoteRobotState?.status === RemoteRobotStatus.NONE) setIsStarting(false);
    }, [remoteRobotState?.status]);

    const validation = useMemo(() => {
        const repoId = draft.repoId.trim();
        const episode = Number(draft.episode);
        const fps = Number(draft.fps);
        if (!remoteConfig?.remote_ip?.trim()) return { ready: false, message: 'Configure the robot IP before replaying.', parsed: null };
        if (!repoId) return { ready: false, message: 'Select or enter a dataset.', parsed: null };
        if (!Number.isInteger(episode) || episode < 0)
            return { ready: false, message: 'Episode must be a whole number starting at 0.', parsed: null };
        if (!Number.isInteger(fps) || fps <= 0) return { ready: false, message: 'FPS must be a positive whole number.', parsed: null };
        return { ready: true, message: '', parsed: { repoId, episode, fps } };
    }, [draft, remoteConfig?.remote_ip]);

    const startReplay = async () => {
        if (!validation.ready || !validation.parsed) throw new Error(validation.message);
        const config: RemoteReplayConfig = {
            nickname: normalizedNickname,
            remote_ip: remoteConfig.remote_ip,
            repo_id: validation.parsed.repoId,
            root: draft.root.trim() || null,
            episode: validation.parsed.episode,
            fps: validation.parsed.fps,
            play_sounds: draft.playSounds,
        };
        setIsStarting(true);
        setRemoteRobotState(nickname, RemoteRobotStatus.STARTING, RemoteControlType.REPLAY, ownedRobot);
        startupListener.current?.();
        startupListener.current = await listen<string>('replay-log', ({ payload }) => {
            if (!payload.startsWith(`[${normalizedNickname}] `)) return;
            if (payload.includes('Replay ready: action loop is running.')) {
                setIsStarting(false);
                setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, RemoteControlType.REPLAY, ownedRobot);
                toast.success('Dataset replay is running.', { ...toastSuccessDefaults });
                startupListener.current?.();
                startupListener.current = null;
            }
        });
        await invoke('start_remote_replay', { config });
    };

    const stopReplay = async () => {
        await invoke('stop_remote_replay', { nickname: normalizedNickname });
        setIsStarting(false);
        startupListener.current?.();
        startupListener.current = null;
        setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
        toast.success('Dataset replay stopped.', { ...toastSuccessDefaults });
    };

    const toggleReplay = async () => {
        try {
            setIsLoading(true);
            if (isReplaying || isStarting) await stopReplay();
            else await startReplay();
        } catch (error) {
            setIsStarting(false);
            startupListener.current?.();
            startupListener.current = null;
            setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
            toast.error(error instanceof Error ? error.message : 'Failed to toggle dataset replay.', { ...toastErrorDefaults });
        } finally {
            setIsLoading(false);
        }
    };

    const selectedDataset = datasets.find((dataset) => dataset.repoId === draft.repoId);
    const disabledMessage = isAnotherControlActive ? 'Stop the active robot operation before starting a replay.' : validation.message;
    const isDisabled = isLoading || (!controlsLocked && (isAnotherControlActive || !validation.ready));

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="rounded-2xl border-2 border-slate-700/70 bg-slate-900/60 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.28)]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="flex items-center gap-3 text-xl font-semibold text-white">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-300">
                            <FaPlayCircle className="h-5 w-5" />
                        </span>
                        Replay
                    </h2>
                    <button
                        type="button"
                        onClick={toggleReplay}
                        disabled={isDisabled}
                        data-tooltip-id="replay-control-tooltip"
                        data-tooltip-content={isDisabled ? disabledMessage : ''}
                        className={`inline-flex min-w-44 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${isDisabled ? 'cursor-not-allowed bg-slate-600 text-slate-300 opacity-60' : controlsLocked ? 'cursor-pointer bg-red-500 text-white hover:bg-red-600' : 'cursor-pointer bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white hover:from-violet-400 hover:to-fuchsia-400'}`}
                    >
                        {isLoading ? (
                            <Spinner color="white" />
                        ) : controlsLocked ? (
                            <>
                                <FaStop className="h-4 w-4" /> {isStarting ? 'Cancel startup' : 'Stop Replay'}
                            </>
                        ) : (
                            <>
                                <FaPlay className="h-4 w-4" /> Start Replay
                            </>
                        )}
                    </button>
                </div>
                <p className="mt-4 text-sm text-slate-300">
                    Select a dataset recorded in the local vulcan-studio folder, then choose the episode to replay.
                </p>

                <div className="mt-5 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-100">Local datasets</h3>
                    <button
                        type="button"
                        onClick={() => void discoverDatasets()}
                        disabled={isDiscovering || controlsLocked}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isDiscovering ? <Spinner color="white" /> : <FaRedo className="h-3 w-3" />} Refresh
                    </button>
                </div>

                {isDiscovering ? (
                    <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 text-sm text-slate-300">
                        <Spinner color="white" /> Finding local datasets...
                    </div>
                ) : datasets.length > 0 ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {datasets.map((dataset) => {
                            const selected = dataset.repoId === draft.repoId;
                            return (
                                <button
                                    type="button"
                                    key={dataset.repoId}
                                    disabled={controlsLocked}
                                    onClick={() => setDraft((current) => ({ ...current, repoId: dataset.repoId, root: '' }))}
                                    className={`cursor-pointer rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-violet-400/70 bg-violet-500/15 ring-1 ring-violet-400/30' : 'border-slate-700/80 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-900'}`}
                                >
                                    <span className="flex items-center gap-2 font-semibold text-slate-100">
                                        <FaFolderOpen className={selected ? 'text-violet-300' : 'text-slate-400'} />
                                        {dataset.name}
                                    </span>
                                    <span className="mt-2 block text-xs text-slate-400">
                                        {dataset.totalEpisodes} {dataset.totalEpisodes === 1 ? 'episode' : 'episodes'} ·{' '}
                                        {dataset.totalFrames.toLocaleString()} frames
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/25 p-4 text-sm text-slate-400">
                        {discoveryError || 'No completed datasets were found in the local vulcan-studio folder.'}
                    </div>
                )}

                <label className="mt-5 flex max-w-48 flex-col gap-1 text-xs text-slate-300">
                    Episode
                    <input
                        type="number"
                        min="0"
                        max={selectedDataset && selectedDataset.totalEpisodes > 0 ? selectedDataset.totalEpisodes - 1 : undefined}
                        step="1"
                        value={draft.episode}
                        disabled={controlsLocked}
                        onChange={(event) => setDraft((current) => ({ ...current, episode: event.target.value }))}
                        className="rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none disabled:opacity-60"
                    />
                </label>

                <button
                    type="button"
                    onClick={() => setIsAdvancedOpen((open) => !open)}
                    className="mt-5 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white"
                >
                    {isAdvancedOpen ? <FaChevronUp /> : <FaChevronDown />} Advanced
                </button>
                {isAdvancedOpen && (
                    <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/30 p-4">
                        <div className="grid gap-3 md:grid-cols-3">
                            <label className="flex flex-col gap-1 text-xs text-slate-300">
                                Dataset ID
                                <input
                                    value={draft.repoId}
                                    disabled={controlsLocked}
                                    onChange={(event) => setDraft((current) => ({ ...current, repoId: event.target.value }))}
                                    className="rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none disabled:opacity-60"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-slate-300">
                                Dataset Root (optional)
                                <input
                                    value={draft.root}
                                    disabled={controlsLocked}
                                    placeholder="Use the default LeRobot cache"
                                    onChange={(event) => setDraft((current) => ({ ...current, root: event.target.value }))}
                                    className="rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none disabled:opacity-60"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-slate-300">
                                FPS
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={draft.fps}
                                    disabled={controlsLocked}
                                    onChange={(event) => setDraft((current) => ({ ...current, fps: event.target.value }))}
                                    className="rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none disabled:opacity-60"
                                />
                            </label>
                        </div>
                        <label className="mt-4 inline-flex items-center gap-2 text-sm text-slate-300">
                            <input
                                type="checkbox"
                                checked={draft.playSounds}
                                disabled={controlsLocked}
                                onChange={(event) => setDraft((current) => ({ ...current, playSounds: event.target.checked }))}
                                className="h-4 w-4 accent-violet-500"
                            />
                            Play replay status sounds
                        </label>
                    </div>
                )}

                {isStarting && (
                    <div
                        role="status"
                        className="mt-4 flex items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-violet-100"
                    >
                        <Spinner color="white" />
                        <div>
                            <p className="text-sm font-semibold">Starting replay... {startupSeconds}s</p>
                            <p className="mt-1 text-xs">Loading the dataset and connecting to the robot.</p>
                        </div>
                    </div>
                )}
                <Tooltip
                    id="replay-control-tooltip"
                    place="top"
                    className="custom-tooltip !z-[1000] !max-w-xs !rounded-lg !border-2 !border-slate-600 !bg-slate-700 !px-3 !py-2 !text-sm !break-words !whitespace-pre-wrap !text-slate-100"
                    border="2px solid #475569"
                    arrowColor="#334155"
                    classNameArrow="!shadow-none"
                />
            </div>
            <RobotLogs isControlling={isReplaying || isStarting} nickname={normalizedNickname} embedded={true} mode="replay" />
        </div>
    );
};
