'use client';

import { BatteryModal } from '@/components/Elements/Modals/KioskRobotModals/BatteryModal';
import {
    calculateBatteryPercent,
    getBatteryChargeState,
    getBatteryLevelStep,
    getBatteryStatusSurfaceClasses,
    type BatteryData,
} from '@/hooks/System/system-info.hook';
import { useState } from 'react';
import { FaBatteryEmpty, FaBatteryFull, FaBatteryHalf, FaBatteryQuarter, FaBatteryThreeQuarters, FaBolt } from 'react-icons/fa';

type RobotBatteryStatusProps = {
    batteryData?: BatteryData | null;
    robotName?: string;
    variant?: 'badge' | 'navbar';
};

const UNAVAILABLE_BATTERY: BatteryData = {
    voltage: -1,
    current_a: -1,
    remaining_capacity_ah: -1,
    max_capacity_ah: -1,
    state_of_charge: -1,
    max_error: -1,
    error: null,
};

const getBatteryIcon = (percent: number) => {
    const level = getBatteryLevelStep(percent);
    if (level === 100) return FaBatteryFull;
    if (level === 75) return FaBatteryThreeQuarters;
    if (level === 50) return FaBatteryHalf;
    if (level === 25) return FaBatteryQuarter;
    return FaBatteryEmpty;
};

export const RobotBatteryStatus = ({ batteryData, robotName = 'Robot', variant = 'badge' }: RobotBatteryStatusProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const data = batteryData ?? UNAVAILABLE_BATTERY;
    const percent = calculateBatteryPercent(data);
    const hasTelemetry = percent >= 0 || Boolean(data.error);
    const isCharging = getBatteryChargeState(data) === 'charging';
    const BatteryIcon = getBatteryIcon(percent);
    const value = percent >= 0 ? `${percent}%` : '--';

    return (
        <>
            <button
                type="button"
                disabled={!hasTelemetry}
                onClick={() => setIsOpen(true)}
                className={`${
                    variant === 'navbar'
                        ? 'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors'
                        : 'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors'
                } ${
                    hasTelemetry
                        ? `${getBatteryStatusSurfaceClasses(percent)} cursor-pointer hover:border-slate-400/70`
                        : 'cursor-default border-slate-600/60 bg-slate-800/50 text-slate-400'
                }`}
                aria-label={hasTelemetry ? `View ${robotName} battery information` : `${robotName} battery information unavailable`}
                title={hasTelemetry ? 'View battery details' : 'Battery telemetry unavailable'}
            >
                <span className="relative">
                    <BatteryIcon className={variant === 'navbar' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
                    {isCharging ? <FaBolt className="absolute -top-1 -right-1 h-2 w-2 text-amber-300" /> : null}
                </span>
                <span>{variant === 'navbar' ? `Battery ${value}` : value}</span>
            </button>

            <BatteryModal
                batteryData={data}
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title={`${robotName} battery`}
                subtitle="Live telemetry from the robot over your LAN"
            />
        </>
    );
};
