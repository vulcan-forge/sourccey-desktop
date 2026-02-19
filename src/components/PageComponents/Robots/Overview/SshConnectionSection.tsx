'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { useGetRemoteConfig, setRemoteConfig } from '@/hooks/Control/remote-config.hook';
import { usePairedRobotConnections } from '@/hooks/Robot/paired-robot-connection.hook';
import { SshControl } from '@/utils/logs/ssh-logs/ssh-control';
import { RemoteRobotStatus, setRemoteRobotState, useGetRemoteRobotState } from '@/hooks/Control/remote-control.hook';
import { isConnected, isConnecting, isDisconnecting } from '@/utils/robot/robot-status';
import type { RemoteConfig } from '@/components/PageComponents/Robots/Config/RemoteRobotConfig';

type SshConnectionSectionProps = {
    ownedRobot: any;
};

export const SshConnectionSection = ({ ownedRobot }: SshConnectionSectionProps) => {
    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = useMemo(() => (nickname.startsWith('@') ? nickname.slice(1) : nickname), [nickname]);
    const { data: remoteConfig, isLoading: isLoadingConfig }: any = useGetRemoteConfig(nickname);
    const { data: remoteRobotState }: any = useGetRemoteRobotState(nickname);
    const { data: pairedConnections }: any = usePairedRobotConnections();

    const [isUpdatingConnection, setIsUpdatingConnection] = useState(false);
    const [connectionError, setConnectionError] = useState<string>('');
    const [isConfigsOpen, setIsConfigsOpen] = useState(false);
    const [draftConfig, setDraftConfig] = useState<RemoteConfig | null>(null);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const hasAppliedPairedHostRef = useRef(false);

    const robotStatus = remoteRobotState?.status ?? RemoteRobotStatus.NONE;
    const isRobotConnected = isConnected(robotStatus);
    const isRobotConnecting = isConnecting(robotStatus);
    const isRobotDisconnecting = isDisconnecting(robotStatus);
    const pairedHost = pairedConnections?.[normalizedNickname]?.host ?? '';

    useEffect(() => {
        if (!remoteConfig || isLoadingConfig) return;
        if (!pairedHost) return;
        if (hasAppliedPairedHostRef.current) return;

        if (remoteConfig.remote_ip !== pairedHost) {
            const updatedConfig = { ...remoteConfig, remote_ip: pairedHost };
            setRemoteConfig(nickname, updatedConfig);
            void invoke('write_remote_config', { config: updatedConfig, nickname }).catch((error) => {
                console.error('Failed to sync paired host into remote config:', error);
            });
        }

        hasAppliedPairedHostRef.current = true;
    }, [remoteConfig, isLoadingConfig, pairedHost, nickname]);

    useEffect(() => {
        if (!remoteConfig || isLoadingConfig) return;
        const host = pairedHost || remoteConfig.remote_ip;
        setDraftConfig({ ...remoteConfig, remote_ip: host });
    }, [remoteConfig, isLoadingConfig, pairedHost]);

    useEffect(() => {
        if (!remoteConfig || isLoadingConfig || !remoteConfig.remote_ip) {
            return;
        }

        let cancelled = false;
        const checkConnection = async () => {
            try {
                const isConnectedNow = await SshControl.isConnected(remoteConfig, nickname);
                if (cancelled) return;
                setRemoteRobotState(nickname, isConnectedNow ? RemoteRobotStatus.CONNECTED : RemoteRobotStatus.NONE, null, ownedRobot);
            } catch {
                if (cancelled) return;
                setRemoteRobotState(nickname, RemoteRobotStatus.NONE, null, ownedRobot);
            }
        };

        checkConnection();
        return () => {
            cancelled = true;
        };
    }, [remoteConfig, nickname, ownedRobot, isLoadingConfig]);

    const connect = async () => {
        if (!remoteConfig) return;
        setIsUpdatingConnection(true);
        setConnectionError('');
        setRemoteRobotState(nickname, RemoteRobotStatus.CONNECTING, null, ownedRobot);
        try {
            await SshControl.connect(remoteConfig, nickname);
            setRemoteRobotState(nickname, RemoteRobotStatus.CONNECTED, null, ownedRobot);
            toast.success(`Connected to ${nickname}`, { ...toastSuccessDefaults });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to connect to robot.';
            setConnectionError(message);
            setRemoteRobotState(nickname, RemoteRobotStatus.NONE, null, ownedRobot);
            toast.error(message, { ...toastErrorDefaults });
        } finally {
            setIsUpdatingConnection(false);
        }
    };

    const disconnect = async () => {
        if (!remoteConfig) return;
        setIsUpdatingConnection(true);
        setConnectionError('');
        setRemoteRobotState(nickname, RemoteRobotStatus.DISCONNECTING, null, ownedRobot);
        try {
            await SshControl.disconnect(remoteConfig, nickname);
            setRemoteRobotState(nickname, RemoteRobotStatus.NONE, null, ownedRobot);
            toast.success(`Disconnected from ${nickname}`, { ...toastSuccessDefaults });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to disconnect from robot.';
            setConnectionError(message);
            setRemoteRobotState(nickname, RemoteRobotStatus.NONE, null, ownedRobot);
            toast.error(message, { ...toastErrorDefaults });
        } finally {
            setIsUpdatingConnection(false);
        }
    };

    const updateDraft = (key: keyof RemoteConfig, value: string | number) => {
        if (!draftConfig) return;
        setDraftConfig({ ...draftConfig, [key]: value });
    };

    const saveConfig = async () => {
        if (!draftConfig) return;
        setIsSavingConfig(true);
        try {
            await invoke('write_remote_config', { config: draftConfig, nickname });
            setRemoteConfig(nickname, draftConfig);
            toast.success('Remote config updated.', { ...toastSuccessDefaults });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to update remote config.';
            toast.error(message, { ...toastErrorDefaults });
        } finally {
            setIsSavingConfig(false);
        }
    };

    return (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-800/60 p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">SSH Connection</h3>
                    <p className="mt-1 text-sm text-slate-300">Connect to the robot before teleoperating.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                        {isRobotConnecting
                            ? 'Connecting'
                            : isRobotDisconnecting
                              ? 'Disconnecting'
                              : isRobotConnected
                                ? 'Connected'
                                : 'Disconnected'}
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsConfigsOpen((open) => !open)}
                        className="inline-flex cursor-pointer items-center rounded-lg border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700"
                    >
                        Configs
                    </button>
                </div>
            </div>

            <div className="text-xs text-slate-400">
                {remoteConfig?.remote_ip
                    ? `Host: ${remoteConfig.remote_ip}:${remoteConfig.remote_port || '22'}`
                    : 'Remote host not configured.'}
            </div>

            {connectionError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{connectionError}</div>
            )}

            <button
                type="button"
                onClick={isRobotConnected ? disconnect : connect}
                disabled={isUpdatingConnection || isRobotConnecting || isRobotDisconnecting}
                className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                    isUpdatingConnection || isRobotConnecting || isRobotDisconnecting
                        ? 'cursor-not-allowed bg-slate-600 text-slate-300'
                        : isRobotConnected
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'bg-green-500 text-white hover:bg-green-600'
                }`}
            >
                {isRobotConnected ? 'Disconnect' : 'Connect'}
            </button>

            {isConfigsOpen && draftConfig && (
                <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900/60 p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="flex flex-col gap-1 text-xs text-slate-400">
                            Host
                            <input
                                value={draftConfig.remote_ip ?? ''}
                                onChange={(event) => updateDraft('remote_ip', event.target.value)}
                                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-400">
                            Port
                            <input
                                value={draftConfig.remote_port ?? ''}
                                onChange={(event) => updateDraft('remote_port', event.target.value)}
                                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-400">
                            Username
                            <input
                                value={draftConfig.username ?? ''}
                                onChange={(event) => updateDraft('username', event.target.value)}
                                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-400">
                            Password
                            <input
                                type="password"
                                value={draftConfig.password ?? ''}
                                onChange={(event) => updateDraft('password', event.target.value)}
                                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-400">
                            Left Arm Port
                            <input
                                value={draftConfig.left_arm_port ?? ''}
                                onChange={(event) => updateDraft('left_arm_port', event.target.value)}
                                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-400">
                            Right Arm Port
                            <input
                                value={draftConfig.right_arm_port ?? ''}
                                onChange={(event) => updateDraft('right_arm_port', event.target.value)}
                                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-400">
                            Keyboard
                            <input
                                value={draftConfig.keyboard ?? ''}
                                onChange={(event) => updateDraft('keyboard', event.target.value)}
                                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-400">
                            FPS
                            <input
                                type="number"
                                value={draftConfig.fps ?? 0}
                                onChange={(event) => updateDraft('fps', Number(event.target.value || 0))}
                                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                            />
                        </label>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button
                            type="button"
                            onClick={saveConfig}
                            disabled={isSavingConfig}
                            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                                isSavingConfig ? 'cursor-not-allowed bg-slate-700 text-slate-400' : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                        >
                            {isSavingConfig ? 'Saving...' : 'Save Config'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
