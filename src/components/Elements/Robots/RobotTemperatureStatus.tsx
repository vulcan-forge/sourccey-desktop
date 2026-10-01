'use client';

import { TemperatureModal } from '@/components/Elements/Modals/KioskRobotModals/TemperatureModal';
import type { ThermalData } from '@/hooks/System/system-info.hook';
import { useState } from 'react';
import { FaThermometerHalf } from 'react-icons/fa';

type RobotTemperatureStatusProps = {
    thermalData?: ThermalData | null;
    robotName?: string;
    variant?: 'badge' | 'navbar';
};

const getTemperatureClasses = (status?: string) => {
    if (status === 'Critical') return 'border-red-400/25 bg-red-500/10 text-red-300';
    if (status === 'Hot') return 'border-orange-400/25 bg-orange-500/10 text-orange-300';
    if (status === 'Warm') return 'border-amber-400/25 bg-amber-500/10 text-amber-200';
    return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300';
};

export const RobotTemperatureStatus = ({ thermalData, robotName = 'Robot', variant = 'badge' }: RobotTemperatureStatusProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const temperature = thermalData?.temperature_celsius;
    const hasTelemetry = typeof temperature === 'number' && Number.isFinite(temperature);
    const value = hasTelemetry ? `${Math.round(temperature)}°C` : '--';

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
                        ? `${getTemperatureClasses(thermalData?.status)} cursor-pointer hover:bg-slate-600/80 hover:text-white`
                        : 'cursor-default border-slate-600/60 bg-slate-800/50 text-slate-400'
                }`}
                aria-label={hasTelemetry ? `View ${robotName} temperature information` : `${robotName} temperature information unavailable`}
                title={hasTelemetry ? 'View temperature details' : 'Temperature telemetry unavailable'}
            >
                <FaThermometerHalf className={variant === 'navbar' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
                <span>{variant === 'navbar' ? `CPU ${value}` : value}</span>
            </button>

            <TemperatureModal
                thermalData={thermalData ?? undefined}
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title={`${robotName} temperature`}
                subtitle="Live telemetry from the robot over your LAN"
            />
        </>
    );
};
