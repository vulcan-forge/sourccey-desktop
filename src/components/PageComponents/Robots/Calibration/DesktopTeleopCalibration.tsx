'use client';

import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FaCheckCircle, FaExclamationTriangle, FaSearch, FaTools } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { Spinner } from '@/components/Elements/Spinner';
import { CalibrationDebugLogs } from '@/components/Elements/Robot/CalibrationDebugLogs';
import { getCalibrationDebugLogs } from '@/hooks/Control/calibration-debug-logs.hook';
import { setRemoteConfig, useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';
import {
    DEFAULT_DESKTOP_TELEOP_TYPE,
    useDesktopTeleopAutoCalibrate,
    useDesktopTeleopCalibrationStatus,
} from '@/hooks/Control/desktop-calibration.hook';
import { setContent } from '@/hooks/Components/OwnedRobots/owned-robots.hook';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { getCalibrationErrorMessage, getCalibrationToastErrorMessage } from '@/components/Elements/Robot/calibration-error';

type DesktopSerialPortInfo = {
    port: string;
    motorIds: number[];
    suggestedArm: 'left' | 'right' | null;
    isComplete: boolean;
    probeError: string | null;
};

export const DesktopTeleopCalibration = ({ ownedRobot, embedded = false }: { ownedRobot: any; embedded?: boolean }) => {
    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = useMemo(() => nickname.trim().replace(/^@+/, ''), [nickname]);
    const teleopType = DEFAULT_DESKTOP_TELEOP_TYPE;
    const { data: remoteConfig } = useGetRemoteConfig(nickname);
    const {
        data: calibrationStatus,
        isLoading,
        refetch,
    } = useDesktopTeleopCalibrationStatus(normalizedNickname, teleopType, !!normalizedNickname);
    const { mutateAsync: autoCalibrate, isPending } = useDesktopTeleopAutoCalibrate();
    const [isLogsVisible, setIsLogsVisible] = useState(false);
    const [logSessionKey, setLogSessionKey] = useState(0);
    const [logBaselineLogs, setLogBaselineLogs] = useState<string[]>([]);
    const [leftArmPortDraft, setLeftArmPortDraft] = useState('');
    const [rightArmPortDraft, setRightArmPortDraft] = useState('');
    const [isSavingPorts, setIsSavingPorts] = useState(false);
    const [isFindingPorts, setIsFindingPorts] = useState(false);
    const [availablePorts, setAvailablePorts] = useState<DesktopSerialPortInfo[] | null>(null);

    useEffect(() => {
        if (!remoteConfig) return;
        setLeftArmPortDraft(remoteConfig.left_arm_port ?? '');
        setRightArmPortDraft(remoteConfig.right_arm_port ?? '');
    }, [remoteConfig]);

    const leftArmPort = leftArmPortDraft.trim();
    const rightArmPort = rightArmPortDraft.trim();
    const isCalibrated = calibrationStatus?.isCalibrated === true;
    const hasBothArmPorts = leftArmPort.length > 0 && rightArmPort.length > 0;
    const portsAreDistinct = leftArmPort !== rightArmPort;
    const leftPortDetection = availablePorts?.find((port) => port.port === leftArmPort);
    const rightPortDetection = availablePorts?.find((port) => port.port === rightArmPort);
    const detectedPortsAreSwapped = leftPortDetection?.suggestedArm === 'right' || rightPortDetection?.suggestedArm === 'left';
    const canRunCalibration = normalizedNickname.length > 0 && hasBothArmPorts && portsAreDistinct && !detectedPortsAreSwapped;

    const saveArmPorts = async (showSuccessToast = true) => {
        if (!remoteConfig || !canRunCalibration) {
            toast.error(
                hasBothArmPorts && !portsAreDistinct
                    ? 'Select a different serial port for each leader arm.'
                    : detectedPortsAreSwapped
                      ? 'The selected ports conflict with the motor IDs detected for the left and right arms.'
                      : 'Enter both leader arm ports before saving.',
                {
                    ...toastErrorDefaults,
                }
            );
            return false;
        }

        const updatedConfig = {
            ...remoteConfig,
            left_arm_port: leftArmPort,
            right_arm_port: rightArmPort,
        };

        setIsSavingPorts(true);
        try {
            await invoke('write_remote_config', { config: updatedConfig, nickname });
            setRemoteConfig(nickname, updatedConfig);
            if (showSuccessToast) {
                toast.success('Teleoperator arm ports saved.', {
                    ...toastSuccessDefaults,
                });
            }
            return true;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to save teleoperator arm ports.';
            toast.error(message, {
                ...toastErrorDefaults,
            });
            return false;
        } finally {
            setIsSavingPorts(false);
        }
    };

    const findPorts = async () => {
        setIsFindingPorts(true);
        try {
            const ports = await invoke<DesktopSerialPortInfo[]>('desktop_list_serial_ports');
            setAvailablePorts(ports);
            if (ports.length === 0) {
                toast.info('No serial ports were found. Connect both leader arms and try again.');
                return;
            }

            const detectedLeftPorts = ports.filter((port) => port.suggestedArm === 'left');
            const detectedRightPorts = ports.filter((port) => port.suggestedArm === 'right');
            const detectedLeftPort = detectedLeftPorts.length === 1 ? detectedLeftPorts[0] : undefined;
            const detectedRightPort = detectedRightPorts.length === 1 ? detectedRightPorts[0] : undefined;
            if (detectedLeftPort) {
                setLeftArmPortDraft(detectedLeftPort.port);
            }
            if (detectedRightPort) {
                setRightArmPortDraft(detectedRightPort.port);
            }
            if (detectedLeftPort && detectedRightPort) {
                toast.success('Detected and assigned both leader arms from their motor IDs.', {
                    ...toastSuccessDefaults,
                });
            } else {
                toast.info('Port scan finished. Review the detection details in each arm port box.');
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to find serial ports.';
            toast.error(message, {
                ...toastErrorDefaults,
            });
        } finally {
            setIsFindingPorts(false);
        }
    };

    const startCalibrationLogSession = async () => {
        setIsLogsVisible(true);
        try {
            const existingLogs = await getCalibrationDebugLogs({
                maxLines: 400,
                maxLinesPerFile: 200,
            });
            setLogBaselineLogs(existingLogs);
        } catch {
            setLogBaselineLogs([]);
        }
        setLogSessionKey((current) => current + 1);
    };

    const runCalibration = async () => {
        if (!canRunCalibration) {
            toast.error('Set left and right arm ports in Config before calibrating.', {
                ...toastErrorDefaults,
            });
            return;
        }

        try {
            const portsSaved = await saveArmPorts(false);
            if (!portsSaved) return;

            await startCalibrationLogSession();
            await autoCalibrate({
                nickname: normalizedNickname,
                teleopType,
                leftArmPort,
                rightArmPort,
            });
            await refetch();

            toast.success('Teleoperator calibration completed.', {
                ...toastSuccessDefaults,
            });
        } catch (error: unknown) {
            const errorMessage = getCalibrationErrorMessage(error);
            const toastErrorMessage = getCalibrationToastErrorMessage(error);
            console.error(`Desktop teleoperator calibration failed: ${toastErrorMessage}`);
            console.debug('Desktop teleoperator calibration failure details:', errorMessage);
            toast.error(toastErrorMessage, {
                ...toastErrorDefaults,
            });
        }
    };

    const formattedModifiedAt = calibrationStatus?.modifiedAt ? new Date(calibrationStatus.modifiedAt).toLocaleString() : null;

    return (
        <div className="flex flex-col gap-5 rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-900/90 to-slate-800/70 p-6 shadow-[0_16px_36px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
                        <FaTools className="h-5 w-5 text-cyan-300" />
                        Teleoperator Calibration
                    </h2>
                    <p className="mt-2 text-sm text-slate-300">
                        Enter the serial port for each leader arm, then calibrate both arms before starting teleoperation.
                    </p>
                </div>
                {!embedded && (
                    <button
                        type="button"
                        onClick={() => setContent('teleoperate')}
                        className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-400"
                    >
                        Back to Teleoperate
                    </button>
                )}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 md:col-span-2">
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                            <Spinner color="yellow" width="w-4" height="h-4" />
                            Checking calibration status...
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                    isCalibrated
                                        ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                                        : 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                                }`}
                            >
                                {isCalibrated ? 'Calibrated' : 'Calibration Required'}
                            </span>
                            <span className="text-xs text-slate-400">Last Calibrated: {formattedModifiedAt ?? 'Unknown'}</span>
                        </div>
                    )}
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                    <div className="text-xs font-semibold tracking-[0.1em] text-slate-400 uppercase">Nickname</div>
                    <div className="mt-1 truncate text-sm font-medium text-slate-100">{nickname || 'Unknown'}</div>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold text-slate-100">Leader arm ports</div>
                    <p className="mt-1 text-xs text-slate-400">
                        Connect and power both leader arms. Discovery reads their motor IDs to identify Left (1–6) and Right (7–12).
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void findPorts()}
                    disabled={isPending || isSavingPorts || isFindingPorts}
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-400 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isFindingPorts ? <Spinner color="white" width="w-3" height="h-3" /> : <FaSearch className="h-3 w-3" />}
                    {isFindingPorts ? 'Scanning Motors...' : 'Find Ports & Motors'}
                </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-xs text-slate-300">
                    Left Leader Arm Port
                    <input
                        value={leftArmPortDraft}
                        onChange={(event) => setLeftArmPortDraft(event.target.value)}
                        disabled={isPending || isSavingPorts}
                        placeholder="COM5 or /dev/robotLeftArm"
                        className="mt-1 rounded-lg border border-slate-600/80 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    {availablePorts !== null ? (
                        leftPortDetection ? (
                            <span className={`mt-2 ${leftPortDetection.isComplete ? 'text-emerald-300' : 'text-amber-300'}`}>
                                {leftPortDetection.probeError
                                    ? `Could not inspect motors: ${leftPortDetection.probeError}`
                                    : leftPortDetection.motorIds.length === 0
                                      ? 'No Feetech motors detected on this port.'
                                      : `Detected ${leftPortDetection.suggestedArm === 'left' ? 'Left arm' : 'unexpected arm'} · Motor IDs: ${leftPortDetection.motorIds.join(', ')}${leftPortDetection.isComplete ? '' : ' (incomplete)'}`}
                            </span>
                        ) : (
                            <span className="mt-2 text-slate-400">This port was not found in the latest scan.</span>
                        )
                    ) : null}
                </label>
                <label className="flex flex-col gap-1 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-xs text-slate-300">
                    Right Leader Arm Port
                    <input
                        value={rightArmPortDraft}
                        onChange={(event) => setRightArmPortDraft(event.target.value)}
                        disabled={isPending || isSavingPorts}
                        placeholder="COM6 or /dev/robotRightArm"
                        className="mt-1 rounded-lg border border-slate-600/80 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    {availablePorts !== null ? (
                        rightPortDetection ? (
                            <span className={`mt-2 ${rightPortDetection.isComplete ? 'text-emerald-300' : 'text-amber-300'}`}>
                                {rightPortDetection.probeError
                                    ? `Could not inspect motors: ${rightPortDetection.probeError}`
                                    : rightPortDetection.motorIds.length === 0
                                      ? 'No Feetech motors detected on this port.'
                                      : `Detected ${rightPortDetection.suggestedArm === 'right' ? 'Right arm' : 'unexpected arm'} · Motor IDs: ${rightPortDetection.motorIds.join(', ')}${rightPortDetection.isComplete ? '' : ' (incomplete)'}`}
                            </span>
                        ) : (
                            <span className="mt-2 text-slate-400">This port was not found in the latest scan.</span>
                        )
                    ) : null}
                </label>
            </div>

            {!canRunCalibration && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    <FaExclamationTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                    {hasBothArmPorts && !portsAreDistinct
                        ? 'Select a different serial port for each leader arm.'
                        : detectedPortsAreSwapped
                          ? 'The selected ports are reversed based on the detected motor IDs. Run Find Ports to assign them correctly.'
                          : 'Enter both leader arm ports above before calibrating.'}
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
                <button
                    type="button"
                    onClick={() => void saveArmPorts()}
                    disabled={isPending || isSavingPorts || !canRunCalibration}
                    className={`inline-flex items-center justify-center rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                        isPending || isSavingPorts || !canRunCalibration
                            ? 'cursor-not-allowed border-slate-700 bg-slate-800 text-slate-500'
                            : 'cursor-pointer border-slate-500 bg-slate-800 text-slate-100 hover:border-slate-300'
                    }`}
                >
                    {isSavingPorts ? 'Saving Ports...' : 'Save Arm Ports'}
                </button>
                <button
                    type="button"
                    onClick={() => void runCalibration()}
                    disabled={isPending || isSavingPorts || !canRunCalibration}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${
                        isPending
                            ? 'cursor-wait bg-blue-600 text-white opacity-80'
                            : isSavingPorts || !canRunCalibration
                              ? 'cursor-not-allowed bg-slate-700 text-slate-400'
                              : 'cursor-pointer bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                >
                    {isPending ? (
                        <>
                            <Spinner color="white" width="w-4" height="h-4" />
                            Calibrating...
                        </>
                    ) : (
                        <>
                            <FaCheckCircle className="h-4 w-4" />
                            Calibrate Teleoperator
                        </>
                    )}
                </button>
            </div>

            <CalibrationDebugLogs
                nickname={normalizedNickname}
                teleopType={teleopType}
                leftArmPort={leftArmPort}
                rightArmPort={rightArmPort}
                isActive={isLogsVisible}
                isRunning={isPending}
                sessionKey={logSessionKey}
                baselineLogs={logBaselineLogs}
            />
        </div>
    );
};
