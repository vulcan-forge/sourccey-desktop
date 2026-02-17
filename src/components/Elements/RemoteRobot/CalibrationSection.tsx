'use client';

import React, { useState } from 'react';
import { FaTools, FaCheckCircle } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import type { Calibration } from '@/components/PageComponents/Robots/RobotConfig';

interface CalibrationSectionProps {
    nickname: string;
    robotType?: string;
    calibration: Calibration | null;
}

export const RobotKioskCalibration: React.FC<CalibrationSectionProps> = ({ nickname, robotType = 'sourccey', calibration }) => {
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [calibrationType, setCalibrationType] = useState<'auto' | 'full' | null>(null);
    const canCalibrate = !!nickname && !!robotType;

    const handleCalibration = async (fullReset: boolean) => {
        if (!canCalibrate) return;

        setIsCalibrating(true);
        setCalibrationType(fullReset ? 'full' : 'auto');

        try {
            const remoteCalibrationConfig = {
                nickname,
                robot_type: robotType,
                full_reset: fullReset,
            };

            await invoke('remote_auto_calibrate', { config: remoteCalibrationConfig });

            toast.success(`${fullReset ? 'Full Calibrate' : 'Auto calibrate'} completed successfully!`, {
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
        <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            <div className="flex w-full items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <FaTools className="h-5 w-5 text-slate-400" />
                    <h2 className="text-xl font-semibold text-white">Calibration</h2>
                </div>
            </div>

            {/* Calibration Type Info Boxes */}
            <div className="my-4 grid grid-cols-2 gap-8">
                {/* Auto Calibrate Info */}
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
                    <div className="mb-2 flex items-center gap-2">
                        <FaCheckCircle className="h-4 w-4 text-blue-400" />
                        <h3 className="text-sm font-semibold text-blue-300">Auto calibrate</h3>
                    </div>
                    <p className="text-xs text-slate-300">Quick calibration that does not move the robot arms through full range.</p>
                </div>

                {/* Full Calibrate Info */}
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                    <div className="mb-2 flex items-center gap-2">
                        <FaTools className="h-4 w-4 text-yellow-400" />
                        <h3 className="text-sm font-semibold text-yellow-300">Full Calibrate</h3>
                    </div>
                    <p className="text-xs text-slate-300">Complete calibration reset. Moves arms through full range to detect motion limits.</p>
                </div>
            </div>

            <div className="border-t border-slate-700 pt-4">
                <div className="mb-3 text-sm font-medium text-slate-300">Current Calibration</div>
                <CurrentCalibration calibration={calibration} />
            </div>

            <div className="mt-4 flex gap-8">
                <button
                    onClick={() => handleCalibration(false)}
                    disabled={isCalibrating || !canCalibrate}
                    className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                        (isCalibrating && calibrationType !== 'auto') || !canCalibrate
                            ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                            : isCalibrating && calibrationType === 'auto'
                              ? 'cursor-wait bg-blue-600 text-white opacity-80'
                              : 'cursor-pointer bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                >
                    {isCalibrating && calibrationType === 'auto' ? (
                        <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            Calibrating...
                        </>
                    ) : (
                        <>
                            <FaCheckCircle className="h-4 w-4" />
                            Auto calibrate
                        </>
                    )}
                </button>

                <button
                    onClick={() => handleCalibration(true)}
                    disabled={isCalibrating || !canCalibrate}
                    className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                        (isCalibrating && calibrationType !== 'full') || !canCalibrate
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
                            Full Calibrate
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export const CurrentCalibration: React.FC<{ calibration: Calibration | null }> = ({ calibration }) => {
    return (
        <div>
            {calibration && Object.keys(calibration).length > 0 ? (
                <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                    <h2 className="text-xl font-semibold text-white">Calibration Configuration</h2>
                    {/* <div className="">
                        {Object.entries(calibration).map(([motorName, motorConfig]: [string, any]) => (
                            <div key={motorName} className="bg-slate-750 rounded-lg border border-slate-600 p-4">
                                <h3 className="mb-2 text-lg font-medium text-slate-200 capitalize">{motorName.replace(/_/g, ' ')}</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-slate-400">ID:</span>
                                        <span className="ml-2 text-white">{motorConfig.id}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400">Drive Mode:</span>
                                        <span className="ml-2 text-white">{motorConfig.drive_mode}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400">Homing Offset:</span>
                                        <span className="ml-2 text-white">{motorConfig.homing_offset}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400">Range:</span>
                                        <span className="ml-2 text-white">
                                            {motorConfig.range_min} - {motorConfig.range_max}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div> */}
                </div>
            ) : (
                <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                    <p className="text-slate-400">No calibration file found for the selected robot yet.</p>
                </div>
            )}
        </div>
    );
};
