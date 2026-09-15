'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaBatteryFull, FaBolt, FaClock, FaExclamationTriangle, FaTachometerAlt, FaTimes } from 'react-icons/fa';
import { calculateBatteryPercent, getBatteryChargeState, getBatteryTimeEstimate, type BatteryData } from '@/hooks/System/system-info.hook';

interface BatteryModalProps {
    batteryData: BatteryData;
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
}

const formatMeasurement = (value: number, unit: string, digits = 2) =>
    Number.isFinite(value) && value >= 0 ? `${value.toFixed(digits)} ${unit}` : 'Unavailable';

const formatCurrent = (current: number) => (Number.isFinite(current) ? `${current > 0 ? '+' : ''}${current.toFixed(2)} A` : 'Unavailable');

const formatDuration = (hours: number | null) => {
    if (hours === null || !Number.isFinite(hours) || hours < 0) return 'Calculating';
    const totalMinutes = Math.round(hours * 60);
    const wholeHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return wholeHours > 0 ? `${wholeHours}h ${minutes}m` : `${minutes}m`;
};

export const BatteryModal = ({
    batteryData,
    isOpen,
    onClose,
    title = 'Battery',
    subtitle = 'Live power and capacity information',
}: BatteryModalProps) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || !mounted) return null;

    const percent = calculateBatteryPercent(batteryData);
    const chargeState = getBatteryChargeState(batteryData);
    const estimate = getBatteryTimeEstimate(batteryData);
    const power =
        Number.isFinite(batteryData.voltage) && batteryData.voltage >= 0 && Number.isFinite(batteryData.current_a)
            ? Math.abs(batteryData.voltage * batteryData.current_a)
            : -1;
    const statusLabel =
        chargeState === 'charging'
            ? 'Charging'
            : chargeState === 'discharging'
              ? 'On battery'
              : chargeState === 'idle'
                ? 'Idle'
                : 'Unavailable';
    const timeLabel = chargeState === 'charging' ? 'Until full' : chargeState === 'discharging' ? 'Time left' : 'Time estimate';

    const metrics = [
        { label: 'Voltage', value: formatMeasurement(batteryData.voltage, 'V'), icon: FaBolt },
        { label: 'Current', value: chargeState === 'unknown' ? 'Unavailable' : formatCurrent(batteryData.current_a), icon: FaTachometerAlt },
        { label: timeLabel, value: formatDuration(estimate), icon: FaClock },
        { label: 'Power', value: formatMeasurement(power, 'W'), icon: FaBolt },
    ];

    return createPortal(
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
            <section
                aria-labelledby="battery-modal-title"
                aria-modal="true"
                role="dialog"
                className="bg-slate-850 max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-600/70 shadow-[0_24px_70px_rgba(2,6,23,0.7)]"
                onClick={(event) => event.stopPropagation()}
            >
                <header className="flex items-center justify-between border-b border-slate-700/80 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <span className="rounded-lg bg-emerald-500/15 p-2 text-emerald-300">
                            <FaBatteryFull className="h-4 w-4" />
                        </span>
                        <div>
                            <h2 id="battery-modal-title" className="text-lg font-semibold text-white">
                                {title}
                            </h2>
                            <p className="text-xs text-slate-400">{subtitle}</p>
                        </div>
                    </div>
                    <button
                        aria-label="Close battery information"
                        onClick={onClose}
                        className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700/70 hover:text-white"
                    >
                        <FaTimes className="h-5 w-5" />
                    </button>
                </header>

                <div className="space-y-3 p-5">
                    {batteryData.error ? (
                        <div className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-200">
                            <FaExclamationTriangle className="mt-0.5 shrink-0" />
                            <span>{batteryData.error}</span>
                        </div>
                    ) : null}

                    <div className="rounded-xl border border-slate-700/80 bg-slate-900/55 p-4">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium text-slate-400">Charge level</p>
                                <p className="text-3xl font-semibold tracking-tight text-white">{percent >= 0 ? `${percent}%` : '--'}</p>
                            </div>
                            <span
                                className={`rounded-full px-3 py-1 text-sm font-medium ${
                                    chargeState === 'charging'
                                        ? 'bg-amber-500/15 text-amber-200'
                                        : chargeState === 'discharging'
                                          ? 'bg-blue-500/15 text-blue-200'
                                          : 'bg-slate-700 text-slate-300'
                                }`}
                            >
                                {statusLabel}
                            </span>
                        </div>
                        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-700/80">
                            <div
                                className={`h-full rounded-full transition-[width] duration-500 ${percent < 10 ? 'bg-red-400' : 'bg-emerald-400'}`}
                                style={{ width: `${Math.max(0, percent)}%` }}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {metrics.map(({ label, value, icon: Icon }) => (
                            <div key={label} className="rounded-xl border border-slate-700/70 bg-slate-800/70 p-3">
                                <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-slate-400 uppercase">
                                    <Icon className="h-3.5 w-3.5" />
                                    {label}
                                </div>
                                <p className="mt-1 text-base font-semibold text-white">{value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-t border-slate-700/70 pt-3 text-sm">
                        <div>
                            <p className="text-slate-400">Remaining capacity</p>
                            <p className="mt-1 font-medium text-slate-100">{formatMeasurement(batteryData.remaining_capacity_ah, 'Ah')}</p>
                        </div>
                        <div>
                            <p className="text-slate-400">Full capacity</p>
                            <p className="mt-1 font-medium text-slate-100">{formatMeasurement(batteryData.max_capacity_ah, 'Ah')}</p>
                        </div>
                        <div>
                            <p className="text-slate-400">Gauge state of charge</p>
                            <p className="mt-1 font-medium text-slate-100">{formatMeasurement(batteryData.state_of_charge, '%', 0)}</p>
                        </div>
                        <div>
                            <p className="text-slate-400">Gauge uncertainty</p>
                            <p className="mt-1 font-medium text-slate-100">
                                {Number.isFinite(batteryData.max_error) && batteryData.max_error >= 0
                                    ? `+/-${batteryData.max_error.toFixed(0)}%`
                                    : 'Unavailable'}
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>,
        document.body
    );
};
