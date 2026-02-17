'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaTools } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { kioskEventManager } from '@/utils/logs/kiosk-logs/kiosk-events';
import { RobotCalibration } from '@/components/Elements/RemoteRobot/RobotCalibration';
import { RobotStartSection } from '@/components/Elements/RemoteRobot/RobotStart';
import { useKioskRobotStartStop } from '@/hooks/Kiosk/robot-start-stop.hook';
import type { Calibration } from '@/components/PageComponents/Robots/RobotConfig';

interface RobotControlProps {
    nickname: string;
    robotType?: string;
    calibration: Calibration | null;
}

type StartupStatus = {
    type: 'success' | 'error' | 'info';
    message: string;
};

const mapHostLogToStartupStatus = (line: string): StartupStatus | null => {
    const normalized = line.toLowerCase();

    if (normalized.includes('waiting for commands')) {
        return {
            type: 'success',
            message: 'Robot online and waiting for commands.',
        };
    }

    if (normalized.includes('serial') || normalized.includes('tty') || normalized.includes('usb') || normalized.includes('port not found')) {
        return {
            type: 'error',
            message: 'Arms not connected. Check USB/data cables and arm power.',
        };
    }

    if (
        normalized.includes('timed out') ||
        normalized.includes('connection refused') ||
        normalized.includes('network is unreachable') ||
        normalized.includes('failed to connect')
    ) {
        return {
            type: 'error',
            message: 'Robot network unavailable. Confirm Wi-Fi/Ethernet and robot IP.',
        };
    }

    if (normalized.includes('permission denied') || normalized.includes('access denied')) {
        return {
            type: 'error',
            message: 'Permission blocked. Restart app with required system permissions.',
        };
    }

    if (normalized.includes('calibration') && (normalized.includes('missing') || normalized.includes('invalid'))) {
        return {
            type: 'error',
            message: 'Calibration missing or invalid. Re-run calibration before starting.',
        };
    }

    if (normalized.includes('traceback') || normalized.includes('exception') || normalized.includes('error')) {
        return {
            type: 'error',
            message: 'Robot start failed with an internal error. Check robot service health.',
        };
    }

    return null;
};

export const RobotControl: React.FC<RobotControlProps> = ({ nickname, robotType = 'sourccey', calibration }) => {
    const lastToastMessageRef = useRef<string | null>(null);
    const hasCalibration = useMemo(() => !!calibration && Object.keys(calibration).length > 0, [calibration]);
    const [activeView, setActiveView] = useState<'control' | 'calibration'>(hasCalibration ? 'control' : 'calibration');

    useEffect(() => {
        if (!hasCalibration) {
            setActiveView('calibration');
        }
    }, [hasCalibration]);

    useEffect(() => {
        if (!nickname) return;

        const unlistenHostLog = kioskEventManager.listenHostLog((line) => {
            const status = mapHostLogToStartupStatus(line);
            if (!status) return;

            if (lastToastMessageRef.current === status.message) {
                return;
            }
            lastToastMessageRef.current = status.message;

            if (status.type === 'success') {
                toast.success(status.message, { ...toastSuccessDefaults });
            } else if (status.type === 'error') {
                toast.error(status.message, { ...toastErrorDefaults });
            } else {
                toast(status.message);
            }
        });

        return () => {
            unlistenHostLog();
        };
    }, [nickname]);

    const { isRobotStarted, isStarting, isStopping, hostLogs, handleStartRobot, handleStopRobot } = useKioskRobotStartStop(
        nickname || ''
    );

    if (!nickname) {
        return (
            <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                <h2 className="text-xl font-semibold text-white">Robot Control</h2>
                <p className="mt-2 text-slate-400">Select a robot to manage calibration and start controls.</p>
            </div>
        );
    }

    const isToggleDisabled = !hasCalibration && activeView === 'calibration';

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-300">Robot Control</div>
                <button
                    type="button"
                    onClick={() => setActiveView(activeView === 'control' ? 'calibration' : 'control')}
                    disabled={isToggleDisabled}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        isToggleDisabled
                            ? 'cursor-not-allowed border-slate-700 bg-slate-800/50 text-slate-500'
                            : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500 hover:bg-slate-700'
                    }`}
                >
                    <FaTools className="h-3.5 w-3.5 text-slate-300" />
                    {activeView === 'control' ? 'Calibration' : hasCalibration ? 'Back to Control' : 'Control (Calibrate first)'}
                </button>
            </div>

            {activeView === 'calibration' || !hasCalibration ? (
                <RobotCalibration nickname={nickname} robotType={robotType} calibration={calibration} />
            ) : (
                <RobotStartSection
                    isRobotStarted={isRobotStarted}
                    isStarting={isStarting}
                    isStopping={isStopping}
                    hostLogs={hostLogs}
                    onStartAction={handleStartRobot}
                    onStopAction={handleStopRobot}
                />
            )}
        </div>
    );
};
