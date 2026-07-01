'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FaChevronDown, FaChevronUp, FaRobot, FaSlidersH, FaTerminal, FaTools, FaWifi } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { updateOwnedRobotNickname } from '@/api/Local/Robot/owned_robot';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { queryClient } from '@/hooks/default';
import { useGetRemoteConfig, setRemoteConfig, REMOTE_CONFIG_KEY } from '@/hooks/Control/remote-config.hook';
import { useLanRobotDiscovery } from '@/hooks/Robot/lan-discovery.hook';
import type { RemoteConfig } from '@/types/remote-config';
import { saveDesktopEnvironmentSettings, useDesktopEnvironmentSettings } from '@/hooks/System/desktop-environment.hook';
import type { DesktopEnvironmentSettings } from '@/types/desktop-environment';
import { DesktopTeleopCalibration } from '@/components/PageComponents/Robots/Calibration/DesktopTeleopCalibration';
import { BASE_OWNED_ROBOT_KEY, setSelectedOwnedRobot } from '@/hooks/Models/OwnedRobot/owned-robot.hook';

type RemoteConfigSectionProps = {
    ownedRobot: any;
    embedded?: boolean;
    showHeader?: boolean;
    isOpen?: boolean;
};

export const RemoteConfigSection = ({ ownedRobot, embedded = false, showHeader = false, isOpen }: RemoteConfigSectionProps) => {
    const nickname = ownedRobot?.nickname ?? '';
    const ownedRobotId = ownedRobot?.id ?? ownedRobot?.owned_robot?.id ?? '';
    const { data: remoteConfig, isLoading: isLoadingConfig }: any = useGetRemoteConfig(nickname);
    const { data: desktopEnvironmentSettings } = useDesktopEnvironmentSettings();

    const [draftConfig, setDraftConfig] = useState<RemoteConfig | null>(null);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [nicknameDraft, setNicknameDraft] = useState(nickname);
    const [isSavingNickname, setIsSavingNickname] = useState(false);
    const [isSavingLogLevel, setIsSavingLogLevel] = useState(false);
    const [isIdentityOpen, setIsIdentityOpen] = useState(false);
    const [isConnectionOpen, setIsConnectionOpen] = useState(false);
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
    const [isLogsOpen, setIsLogsOpen] = useState(false);
    const currentHost = draftConfig?.remote_ip?.trim() ?? remoteConfig?.remote_ip?.trim() ?? '';
    const { data: discoveryResult, isLoading: isDiscoveryLoading } = useLanRobotDiscovery(!!currentHost);
    const discoveredHost = discoveryResult?.hosts.find((entry) => entry.ipAddress.trim() === currentHost);
    const isOnline = Boolean(discoveredHost);
    const hostRunning = discoveredHost?.hostRunning ?? false;

    useEffect(() => {
        if (!remoteConfig || isLoadingConfig) return;
        setDraftConfig(remoteConfig);
    }, [remoteConfig, isLoadingConfig]);

    useEffect(() => {
        setNicknameDraft(nickname);
    }, [nickname]);

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

    const saveNickname = async () => {
        const trimmed = nicknameDraft.trim();
        if (!ownedRobotId) {
            toast.error('Unable to update this robot name.', { ...toastErrorDefaults });
            return;
        }
        if (!trimmed) {
            toast.error('Robot name cannot be empty.', { ...toastErrorDefaults });
            return;
        }
        if (trimmed === nickname) {
            toast.success('Robot name is already up to date.', { ...toastSuccessDefaults });
            return;
        }

        setIsSavingNickname(true);
        try {
            await updateOwnedRobotNickname(ownedRobotId, trimmed);

            if (draftConfig) {
                setRemoteConfig(trimmed, draftConfig);
                queryClient.removeQueries({ queryKey: REMOTE_CONFIG_KEY(nickname), exact: true });
            }

            const updatedOwnedRobot = {
                ...ownedRobot,
                nickname: trimmed,
                owned_robot: ownedRobot?.owned_robot
                    ? {
                          ...ownedRobot.owned_robot,
                          nickname: trimmed,
                      }
                    : ownedRobot?.owned_robot,
            };
            setSelectedOwnedRobot(updatedOwnedRobot);
            await queryClient.invalidateQueries({ queryKey: [BASE_OWNED_ROBOT_KEY] });
            await queryClient.invalidateQueries({ queryKey: [BASE_OWNED_ROBOT_KEY, 'id', ownedRobotId] });

            toast.success('Robot name updated.', { ...toastSuccessDefaults });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to update robot name.';
            toast.error(message, { ...toastErrorDefaults });
        } finally {
            setIsSavingNickname(false);
        }
    };

    const saveLogLevel = async (nextTeleopLogLevel: DesktopEnvironmentSettings['teleopLogLevel']) => {
        if (!desktopEnvironmentSettings) {
            return;
        }

        setIsSavingLogLevel(true);
        try {
            await saveDesktopEnvironmentSettings({
                environment: desktopEnvironmentSettings.environment,
                teleopLogLevel: nextTeleopLogLevel,
            });
            toast.success('Teleop log level updated.', { ...toastSuccessDefaults });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to update teleop log level.';
            toast.error(message, { ...toastErrorDefaults });
        } finally {
            setIsSavingLogLevel(false);
        }
    };

    const isConfigsVisible = isOpen ?? true;
    return (
        <div className="flex flex-col gap-4">
            {showHeader && !embedded && <h3 className="text-lg font-semibold text-white">Remote Config</h3>}
            <ConfigSection
                title="Robot identity"
                icon={<FaRobot className="h-4 w-4 text-cyan-300" />}
                description="Keep the robot name friendly and easy to recognize."
                isOpen={isIdentityOpen}
                onToggle={() => setIsIdentityOpen((current) => !current)}
            >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="flex flex-col gap-1 text-xs text-slate-300">
                        Robot name
                        <input
                            value={nicknameDraft}
                            onChange={(event) => setNicknameDraft(event.target.value)}
                            disabled={isSavingNickname}
                            className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={saveNickname}
                        disabled={isSavingNickname || nicknameDraft.trim().length === 0}
                        className={`self-end rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                            isSavingNickname || nicknameDraft.trim().length === 0
                                ? 'cursor-not-allowed bg-slate-700 text-slate-400'
                                : 'cursor-pointer bg-cyan-600 text-white hover:bg-cyan-700'
                        }`}
                    >
                        {isSavingNickname ? 'Saving...' : 'Save Name'}
                    </button>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                    Renaming also carries this robot&apos;s local config and calibration references to the new name.
                </div>
            </ConfigSection>

            {isConfigsVisible && draftConfig && (
                <ConfigSection
                    title="Connection"
                    icon={<FaWifi className="h-4 w-4 text-emerald-300" />}
                    description="Keep the common network values close at hand."
                    isOpen={isConnectionOpen}
                    onToggle={() => setIsConnectionOpen((current) => !current)}
                >
                    <div className="mb-4 rounded-lg border border-slate-700/60 bg-slate-950/40 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-slate-100">{currentHost || 'Robot IP not configured yet'}</div>
                            {currentHost ? (
                                <>
                                    <div
                                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                            isDiscoveryLoading && !discoveryResult
                                                ? 'border-slate-600 bg-slate-800 text-slate-200'
                                                : isOnline
                                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                                                  : 'border-rose-500/40 bg-rose-500/10 text-rose-100'
                                        }`}
                                    >
                                        {isDiscoveryLoading && !discoveryResult ? 'Checking LAN...' : isOnline ? 'Online' : 'Offline'}
                                    </div>
                                    <div
                                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                            !isOnline
                                                ? 'border-slate-600 bg-slate-800 text-slate-300'
                                                : hostRunning
                                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                                                  : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                                        }`}
                                    >
                                        {!isOnline ? 'Host unknown' : hostRunning ? 'Host running' : 'Host stopped'}
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                            Host
                            <input
                                value={draftConfig.remote_ip ?? ''}
                                onChange={(event) => updateDraft('remote_ip', event.target.value)}
                                className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                            />
                        </label>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="flex flex-col gap-1 text-xs text-slate-300">
                                Left Arm Teleop Port
                                <input
                                    value={draftConfig.left_arm_port ?? ''}
                                    onChange={(event) => updateDraft('left_arm_port', event.target.value)}
                                    className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-slate-300">
                                Right Arm Teleop Port
                                <input
                                    value={draftConfig.right_arm_port ?? ''}
                                    onChange={(event) => updateDraft('right_arm_port', event.target.value)}
                                    className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                                />
                            </label>
                        </div>
                    </div>
                    <div className="mt-3">
                        <ConfigSection
                            title="Advanced"
                            icon={<FaSlidersH className="h-4 w-4 text-amber-300" />}
                            description="Less common values stay tucked away until you need them."
                            isOpen={isAdvancedOpen}
                            onToggle={() => setIsAdvancedOpen((current) => !current)}
                        >
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <label className="flex flex-col gap-1 text-xs text-slate-300">
                                    SSH Port
                                    <input
                                        value={draftConfig.remote_port ?? ''}
                                        onChange={(event) => updateDraft('remote_port', event.target.value)}
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
                        </ConfigSection>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button
                            type="button"
                            onClick={saveConfig}
                            disabled={isSavingConfig}
                            className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                                isSavingConfig
                                    ? 'cursor-not-allowed bg-slate-700 text-slate-400'
                                    : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                        >
                            {isSavingConfig ? 'Saving...' : 'Save Connection'}
                        </button>
                    </div>
                </ConfigSection>
            )}

            {isConfigsVisible && (
                <ConfigSection
                    title="Calibration"
                    icon={<FaTools className="h-4 w-4 text-yellow-300" />}
                    description="Open this only when you are ready to calibrate hardware."
                    isOpen={isCalibrationOpen}
                    onToggle={() => setIsCalibrationOpen((current) => !current)}
                >
                    <DesktopTeleopCalibration ownedRobot={ownedRobot} embedded={true} />
                </ConfigSection>
            )}

            {isConfigsVisible && (
                <ConfigSection
                    title="Logs"
                    icon={<FaTerminal className="h-4 w-4 text-violet-300" />}
                    description="Control how much teleoperation output is shown for this desktop. Default is warning."
                    isOpen={isLogsOpen}
                    onToggle={() => setIsLogsOpen((current) => !current)}
                >
                    <label className="flex max-w-xs flex-col gap-1 text-xs text-slate-300">
                        Log Level
                        <select
                            value={desktopEnvironmentSettings?.teleopLogLevel ?? 'warning'}
                            onChange={(event) =>
                                void saveLogLevel(event.target.value as DesktopEnvironmentSettings['teleopLogLevel'])
                            }
                            disabled={!desktopEnvironmentSettings || isSavingLogLevel}
                            className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <option value="info">Info</option>
                            <option value="warning">Warning</option>
                            <option value="error">Error</option>
                        </select>
                    </label>
                </ConfigSection>
            )}
        </div>
    );
};

const ConfigSection = ({
    title,
    description,
    icon,
    isOpen,
    onToggle,
    children,
}: {
    title: string;
    description: string;
    icon: ReactNode;
    isOpen: boolean;
    onToggle: () => void;
    children: ReactNode;
}) => (
    <div className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/55">
        <button
            type="button"
            onClick={onToggle}
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-800/60"
        >
            <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 shrink-0">{icon}</div>
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{title}</div>
                    <div className="mt-1 text-xs text-slate-400">{description}</div>
                </div>
            </div>
            <div className="shrink-0 text-slate-400">{isOpen ? <FaChevronUp className="h-4 w-4" /> : <FaChevronDown className="h-4 w-4" />}</div>
        </button>
        {isOpen ? <div className="border-t border-slate-700/60 px-4 py-4">{children}</div> : null}
    </div>
);
