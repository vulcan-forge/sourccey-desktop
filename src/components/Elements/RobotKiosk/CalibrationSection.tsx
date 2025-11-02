'use client';

import React, { useState } from 'react';
import { FaTools, FaCheckCircle } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';

interface CalibrationSectionProps {
    nickname: string;
    robotType?: string;
}

export const RobotKioskCalibration: React.FC<CalibrationSectionProps> = ({ nickname, robotType = 'sourccey' }) => {
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [calibrationType, setCalibrationType] = useState<'standard' | 'full' | null>(null);

    const handleCalibration = async (fullReset: boolean) => {
        setIsCalibrating(true);
        setCalibrationType(fullReset ? 'full' : 'standard');

        try {
            const remoteCalibrationConfig = {
                nickname,
                robot_type: robotType,
                full_reset: fullReset,
            };

            await invoke('remote_auto_calibrate', { config: remoteCalibrationConfig });

            toast.success(`${fullReset ? 'Full' : 'Standard'} calibration completed successfully!`, {
                ...toastSuccessDefaults,
            });
        } catch (error: any) {
            console.error('Calibration failed:', error);
            toast.error(`${fullReset ? 'Full' : 'Standard'} calibration failed: ${error?.message || 'Unknown error'}`, {
                ...toastErrorDefaults,
            });
        } finally {
            setIsCalibrating(false);
            setCalibrationType(null);
        }
    };

    return (
        <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2">
                <FaTools className="h-5 w-5 text-slate-400" />
                <h2 className="text-xl font-semibold text-white">Robot Calibration</h2>
            </div>

            {/* Calibration Type Info Boxes */}
            <div className="mb-4 grid grid-cols-2 gap-8">
                {/* Standard Calibration Info */}
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
                    <div className="mb-2 flex items-center gap-2">
                        <FaCheckCircle className="h-4 w-4 text-blue-400" />
                        <h3 className="text-sm font-semibold text-blue-300">Standard Calibration</h3>
                    </div>
                    <p className="text-xs text-slate-300">
                        Quick calibration that doesn't move the robot arms. Recommended for regular maintenance.
                    </p>
                </div>

                {/* Full Calibration Info */}
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                    <div className="mb-2 flex items-center gap-2">
                        <FaTools className="h-4 w-4 text-yellow-400" />
                        <h3 className="text-sm font-semibold text-yellow-300">Full Calibration</h3>
                    </div>
                    <p className="text-xs text-slate-300">
                        Complete calibration reset. Moves arms to maximum positions to detect full range of motion.
                    </p>
                </div>
            </div>

            <div className="flex gap-8">
                <button
                    onClick={() => handleCalibration(false)}
                    disabled={isCalibrating}
                    className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                        isCalibrating && calibrationType !== 'standard'
                            ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                            : isCalibrating && calibrationType === 'standard'
                              ? 'cursor-wait bg-blue-600 text-white opacity-80'
                              : 'cursor-pointer bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                >
                    {isCalibrating && calibrationType === 'standard' ? (
                        <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            Calibrating...
                        </>
                    ) : (
                        <>
                            <FaCheckCircle className="h-4 w-4" />
                            Standard Calibration
                        </>
                    )}
                </button>

                <button
                    onClick={() => handleCalibration(true)}
                    disabled={isCalibrating}
                    className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                        isCalibrating && calibrationType !== 'full'
                            ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                            : isCalibrating && calibrationType === 'full'
                              ? 'cursor-wait bg-yellow-500 text-white opacity-80'
                              : 'cursor-pointer bg-yellow-500 text-white hover:bg-yellow-600'
                    }`}
                >
                    {isCalibrating && calibrationType === 'full' ? (
                        <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            Calibrating...
                        </>
                    ) : (
                        <>
                            <FaTools className="h-4 w-4" />
                            Full Calibration
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
