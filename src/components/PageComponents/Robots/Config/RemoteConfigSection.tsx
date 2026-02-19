'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { useGetRemoteConfig, setRemoteConfig } from '@/hooks/Control/remote-config.hook';
import { usePairedRobotConnections } from '@/hooks/Robot/paired-robot-connection.hook';
import type { RemoteConfig } from '@/components/PageComponents/Robots/Config/RemoteRobotConfig';

type RemoteConfigSectionProps = {
    ownedRobot: any;
    embedded?: boolean;
    showHeader?: boolean;
    isOpen?: boolean;
};

export const RemoteConfigSection = ({ ownedRobot, embedded = false, showHeader = false, isOpen }: RemoteConfigSectionProps) => {
    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = useMemo(() => (nickname.startsWith('@') ? nickname.slice(1) : nickname), [nickname]);
    const { data: remoteConfig, isLoading: isLoadingConfig }: any = useGetRemoteConfig(nickname);
    const { data: pairedConnections }: any = usePairedRobotConnections();

    const [draftConfig, setDraftConfig] = useState<RemoteConfig | null>(null);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const hasAppliedPairedHostRef = useRef(false);

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

    const isConfigsVisible = isOpen ?? true;
    return (
        <div className={'flex flex-col gap-3 rounded-xl border-2 border-slate-700/60 bg-slate-900/20 p-4'}>
            {showHeader && !embedded && <h3 className="text-lg font-semibold text-white">Remote Config</h3>}

            {isConfigsVisible && draftConfig && (
                <div className="mt-2 rounded-lg p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Host
                            <input
                                value={draftConfig.remote_ip ?? ''}
                                onChange={(event) => updateDraft('remote_ip', event.target.value)}
                                className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Port
                            <input
                                value={draftConfig.remote_port ?? ''}
                                onChange={(event) => updateDraft('remote_port', event.target.value)}
                                className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Username
                            <input
                                value={draftConfig.username ?? ''}
                                onChange={(event) => updateDraft('username', event.target.value)}
                                className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Password
                            <input
                                type="password"
                                value={draftConfig.password ?? ''}
                                onChange={(event) => updateDraft('password', event.target.value)}
                                className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Left Arm Port
                            <input
                                value={draftConfig.left_arm_port ?? ''}
                                onChange={(event) => updateDraft('left_arm_port', event.target.value)}
                                className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Right Arm Port
                            <input
                                value={draftConfig.right_arm_port ?? ''}
                                onChange={(event) => updateDraft('right_arm_port', event.target.value)}
                                className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Keyboard
                            <input
                                value={draftConfig.keyboard ?? ''}
                                onChange={(event) => updateDraft('keyboard', event.target.value)}
                                className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            FPS
                            <input
                                type="number"
                                value={draftConfig.fps ?? 0}
                                onChange={(event) => updateDraft('fps', Number(event.target.value || 0))}
                                className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                            />
                        </label>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button
                            type="button"
                            onClick={saveConfig}
                            disabled={isSavingConfig}
                            className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
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
