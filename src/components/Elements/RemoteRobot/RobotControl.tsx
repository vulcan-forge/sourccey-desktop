'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FaCheckCircle, FaTools } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { invoke } from '@tauri-apps/api/core';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { kioskEventManager } from '@/utils/logs/kiosk-logs/kiosk-events';

interface RobotControlProps {
    nickname: string;
    robotType?: string;
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

    if (
        normalized.includes('serial') ||
        normalized.includes('tty') ||
        normalized.includes('usb') ||
        normalized.includes('port not found')
    ) {
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

export const RobotControl: React.FC<RobotControlProps> = ({ nickname, robotType = 'sourccey' }) => {
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [calibrationType, setCalibrationType] = useState<'auto' | 'full' | null>(null);
    const lastToastMessageRef = useRef<string | null>(null);

    useEffect(() => {
        if (!nickname) return;

        const unlistenStopRobotError = kioskEventManager.listenStopRobotError((payload) => {
            if (payload.nickname !== nickname) return;
            toast.error(payload.error || 'Failed to stop robot.', { ...toastErrorDefaults });
        });

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
            unlistenStopRobotError();
            unlistenHostLog();
        };
    }, [nickname]);

    const handleCalibration = async (fullReset: boolean) => {
        setIsCalibrating(true);
        setCalibrationType(fullReset ? 'full' : 'auto');

        try {
            const remoteCalibrationConfig = {
                nickname,
                robot_type: robotType,
                full_reset: fullReset,
            };

            await invoke('remote_auto_calibrate', { config: remoteCalibrationConfig });
            toast.success(`${fullReset ? 'Full Calibrate' : 'Auto calibrate'} completed successfully.`, {
                ...toastSuccessDefaults,
            });
        } catch (error: any) {
            console.error('Calibration failed:', error);
            toast.error(`${fullReset ? 'Full Calibrate' : 'Auto calibrate'} failed: ${error?.message || 'Unknown error'}`, {
                ...toastErrorDefaults,
            });
        } finally {
            setIsCalibrating(false);
            setCalibrationType(null);
        }
    };

    return (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            {/* Control Header */}
            <div className="flex items-center justify-start gap-4">
                <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
                    <FaTools className="h-5 w-5 text-slate-400" />
                    Calibration
                </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <button
                    onClick={() => handleCalibration(false)}
                    disabled={isCalibrating}
                    className={`inline-flex min-h-20 items-center justify-center gap-3 rounded-xl px-6 py-5 text-xl font-semibold transition-all ${
                        isCalibrating && calibrationType !== 'auto'
                            ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                            : isCalibrating && calibrationType === 'auto'
                              ? 'cursor-wait bg-blue-600 text-white opacity-80'
                              : 'cursor-pointer bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                    }`}
                >
                    {isCalibrating && calibrationType === 'auto' ? (
                        <>
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            Calibrating...
                        </>
                    ) : (
                        <>
                            <FaCheckCircle className="h-5 w-5" />
                            Auto calibrate
                        </>
                    )}
                </button>

                <button
                    onClick={() => handleCalibration(true)}
                    disabled={isCalibrating}
                    className={`inline-flex min-h-20 items-center justify-center gap-3 rounded-xl px-6 py-5 text-xl font-semibold transition-all ${
                        isCalibrating && calibrationType !== 'full'
                            ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                            : isCalibrating && calibrationType === 'full'
                              ? 'cursor-wait bg-yellow-500 text-white opacity-80'
                              : 'cursor-pointer bg-yellow-500 text-white hover:bg-yellow-600 active:bg-yellow-700'
                    }`}
                >
                    {isCalibrating && calibrationType === 'full' ? (
                        <>
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            Calibrating...
                        </>
                    ) : (
                        <>
                            <FaTools className="h-5 w-5" />
                            Full Calibrate
                        </>
                    )}
                </button>
            </div>
            <p className="text-sm text-slate-400">
                Start diagnostics are now shown as toast messages.
            </p>
        </div>
    );
};
