'use client';

import { useMemo } from 'react';
import { FaCheckCircle, FaExclamationTriangle, FaTools } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { Spinner } from '@/components/Elements/Spinner';
import { useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';
import {
    DEFAULT_DESKTOP_TELEOP_TYPE,
    useDesktopTeleopAutoCalibrate,
    useDesktopTeleopCalibrationStatus,
} from '@/hooks/Control/desktop-calibration.hook';
import { setContent } from '@/hooks/Components/OwnedRobots/owned-robots.hook';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { getCalibrationErrorMessage, getCalibrationToastErrorMessage } from '@/components/Elements/RemoteRobot/calibration-error';

export const DesktopTeleopCalibration = ({ ownedRobot, embedded = false }: { ownedRobot: any; embedded?: boolean }) => {
    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = useMemo(() => nickname.trim().replace(/^@+/, ''), [nickname]);
    const teleopType = DEFAULT_DESKTOP_TELEOP_TYPE;
    const { data: remoteConfig } = useGetRemoteConfig(nickname);
    const { data: calibrationStatus, isLoading, refetch } = useDesktopTeleopCalibrationStatus(normalizedNickname, teleopType, !!normalizedNickname);
    const { mutateAsync: autoCalibrate, isPending } = useDesktopTeleopAutoCalibrate();

    const leftArmPort = remoteConfig?.left_arm_port ?? '';
    const rightArmPort = remoteConfig?.right_arm_port ?? '';
    const isCalibrated = calibrationStatus?.isCalibrated === true;
    const canRunCalibration = normalizedNickname.length > 0 && leftArmPort.length > 0 && rightArmPort.length > 0;

    const runCalibration = async () => {
        if (!canRunCalibration) {
            toast.error('Set left and right arm ports in Config before calibrating.', {
                ...toastErrorDefaults,
            });
            return;
        }

        try {
            await autoCalibrate({
                nickname: normalizedNickname,
                teleopType,
                leftArmPort,
                rightArmPort,
                fullReset: false,
            });
            await refetch();

            toast.success('Teleoperator calibration completed.', {
                ...toastSuccessDefaults,
            });
        } catch (error: unknown) {
            const errorMessage = getCalibrationErrorMessage(error);
            const toastErrorMessage = getCalibrationToastErrorMessage(error);
            console.error('Desktop teleoperator calibration failed:', errorMessage);
            toast.error(`Calibration failed: ${toastErrorMessage}`, {
                ...toastErrorDefaults,
            });
        }
    };

    const formattedModifiedAt = calibrationStatus?.modifiedAt
        ? new Date(calibrationStatus.modifiedAt).toLocaleString()
        : null;

    return (
        <div className="flex flex-col gap-5 rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-900/90 to-slate-800/70 p-6 shadow-[0_16px_36px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
                        <FaTools className="h-5 w-5 text-cyan-300" />
                        Teleoperator Calibration
                    </h2>
                    <p className="mt-2 text-sm text-slate-300">
                        Run calibration before teleoperation to keep movement accurate and stable.
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
                            <span className="text-xs text-slate-400">
                                Last Calibrated: {formattedModifiedAt ?? 'Unknown'}
                            </span>
                        </div>
                    )}
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                    <div className="text-xs font-semibold tracking-[0.1em] text-slate-400 uppercase">Nickname</div>
                    <div className="mt-1 truncate text-sm font-medium text-slate-100">{nickname || 'Unknown'}</div>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                    <div className="text-xs font-semibold tracking-[0.1em] text-slate-400 uppercase">Left Arm Port</div>
                    <div className={`mt-1 text-sm ${leftArmPort ? 'text-slate-100' : 'text-slate-400'}`}>{leftArmPort || 'Not set'}</div>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                    <div className="text-xs font-semibold tracking-[0.1em] text-slate-400 uppercase">Right Arm Port</div>
                    <div className={`mt-1 text-sm ${rightArmPort ? 'text-slate-100' : 'text-slate-400'}`}>{rightArmPort || 'Not set'}</div>
                </div>
            </div>

            {!canRunCalibration && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    <FaExclamationTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                    Configure both arm ports in Config before calibrating.
                </div>
            )}

            <button
                type="button"
                onClick={() => void runCalibration()}
                disabled={isPending || !canRunCalibration}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${
                    isPending
                        ? 'cursor-wait bg-blue-600 text-white opacity-80'
                        : !canRunCalibration
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
                        Auto Calibrate
                    </>
                )}
            </button>
        </div>
    );
};
