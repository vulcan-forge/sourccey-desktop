'use client';

import React, { useState } from 'react';
import { FaTools, FaCheckCircle, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import type { Calibration } from '@/components/PageComponents/OwnedRobots/RobotConfig';

interface CalibrationSectionProps {
    nickname: string;
    robotType?: string;
    calibration: Calibration;
}

export const RobotKioskCalibration: React.FC<CalibrationSectionProps> = ({ nickname, robotType = 'sourccey', calibration }) => {
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [calibrationType, setCalibrationType] = useState<'standard' | 'full' | null>(null);
    const [showCurrentCalibration, setShowCurrentCalibration] = useState(false);

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

            <div className="mb-4 flex gap-8">
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

            {/* Current Calibration Dropdown */}
            <div className="border-t border-slate-700 pt-4">
                <button
                    onClick={() => setShowCurrentCalibration(!showCurrentCalibration)}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg bg-slate-700/50 px-4 py-3 text-sm font-medium text-slate-300 transition-colors duration-200 hover:bg-slate-600/50 hover:text-white"
                >
                    <span>View Current Calibration</span>
                    {showCurrentCalibration ? <FaChevronUp className="h-4 w-4" /> : <FaChevronDown className="h-4 w-4" />}
                </button>

                {showCurrentCalibration && (
                    <div className="mt-4">
                        <CurrentCalibration calibration={calibration} />
                    </div>
                )}
            </div>
        </div>
    );
};

export const CurrentCalibration: React.FC<{ calibration: Calibration }> = ({ calibration }) => {
    return (
        <div>
            {calibration ? (
                <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                    <h2 className="mb-4 text-xl font-semibold text-white">Calibration Configuration</h2>
                    <div className="space-y-4">
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
                    </div>
                </div>
            ) : (
                <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                    <p className="text-slate-400">Loading calibration data...</p>
                </div>
            )}
        </div>
    );
};
