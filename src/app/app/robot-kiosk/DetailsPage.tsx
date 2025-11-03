'use client';

import React from 'react';
import { RobotKioskCalibration } from '@/components/Elements/RobotKiosk/CalibrationSection';
import { RobotControl } from '@/components/Elements/RobotKiosk/RobotControl';
import { useGetCalibration } from '@/hooks/Control/config.hook';

export const KioskRobotDetailsPage: React.FC = () => {
    const nickname = 'sourccey';
    const robotType = 'sourccey';

    const { data: calibration }: any = useGetCalibration(nickname);
    console.log('calibration', calibration);
    return (
        <div className="bg-slate-850 flex h-screen flex-col">
            <div className="w-full space-y-4 p-6">
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
                <RobotKioskCalibration nickname={nickname} robotType={robotType} />
                {calibration && <RobotControl nickname={nickname} />}
            </div>
        </div>
    );
};
