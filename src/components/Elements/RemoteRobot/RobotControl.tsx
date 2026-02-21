'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaTools } from 'react-icons/fa';
import { RobotCalibration } from '@/components/Elements/RemoteRobot/RobotCalibration';
import { RobotStartSection } from '@/components/Elements/RemoteRobot/RobotStart';
import { useKioskRobotStartStop } from '@/hooks/Kiosk/robot-start-stop.hook';
import type { Calibration } from '@/components/PageComponents/Robots/Config/RemoteRobotConfig';

interface RobotControlProps {
    nickname: string;
    robotType?: string;
    calibration: Calibration | null;
}

export const RobotControl: React.FC<RobotControlProps> = ({ nickname, robotType = 'sourccey', calibration }) => {
    const hasCalibration = useMemo(() => !!calibration && Object.keys(calibration).length > 0, [calibration]);
    const [activeView, setActiveView] = useState<'control' | 'calibration'>(hasCalibration ? 'control' : 'calibration');
    const previousHasCalibrationRef = useRef(hasCalibration);

    useEffect(() => {
        if (!hasCalibration) {
            setActiveView('calibration');
        } else if (!previousHasCalibrationRef.current) {
            setActiveView('control');
        }
        previousHasCalibrationRef.current = hasCalibration;
    }, [hasCalibration]);

    const { isRobotStarted, isStarting, isStopping, handleStartRobot, handleStopRobot } = useKioskRobotStartStop(nickname || '');

    if (!nickname) {
        return (
            <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                <h2 className="text-xl font-semibold text-white">Robot Control</h2>
                <p className="mt-2 text-slate-400">Select a robot to manage calibration and start controls.</p>
            </div>
        );
    }

    const isToggleDisabled = !hasCalibration;

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

            {!hasCalibration || activeView === 'calibration' ? (
                <RobotCalibration
                    nickname={nickname}
                    robotType={robotType}
                    calibration={calibration}
                    onCalibrationSuccess={() => setActiveView('control')}
                />
            ) : (
                <RobotStartSection
                    nickname={nickname}
                    isRobotStarted={isRobotStarted}
                    isStarting={isStarting}
                    isStopping={isStopping}
                    onStartAction={handleStartRobot}
                    onStopAction={handleStopRobot}
                />
            )}
        </div>
    );
};
