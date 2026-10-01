'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaFan, FaFire, FaInfoCircle, FaThermometerHalf, FaTimes } from 'react-icons/fa';
import type { ThermalData } from '@/hooks/System/system-info.hook';

interface TemperatureModalProps {
    isOpen: boolean;
    onClose: () => void;
    thermalData?: ThermalData;
}

const unavailableThermalData: ThermalData = {
    temperature_celsius: null,
    status: 'Unavailable',
    fan_speed_rpm: null,
    fan_running: null,
    cooling_state: null,
    cooling_max_state: null,
    source: null,
};

const statusClasses: Record<string, string> = {
    Normal: 'bg-emerald-500/15 text-emerald-200',
    Warm: 'bg-amber-500/15 text-amber-200',
    Hot: 'bg-orange-500/15 text-orange-200',
    Critical: 'bg-red-500/15 text-red-200',
    Unavailable: 'bg-slate-700 text-slate-300',
};

export function TemperatureModal({ isOpen, onClose, thermalData }: TemperatureModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);
    useEffect(() => {
        if (!isOpen) return;
        const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [isOpen, onClose]);

    if (!mounted || !isOpen) return null;

    const details = thermalData ?? unavailableThermalData;
    const temperature = details.temperature_celsius;
    const fanLabel =
        details.fan_running === true ? 'Running' : details.fan_running === false ? 'Stopped' : 'Not reported';
    const coolingLevel =
        details.cooling_state !== null && details.cooling_max_state !== null
            ? `${details.cooling_state} of ${details.cooling_max_state}`
            : 'Not reported';

    return createPortal(
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="temperature-modal-title"
                className="bg-slate-850 w-full max-w-lg rounded-2xl border border-slate-600/70 shadow-[0_24px_70px_rgba(2,6,23,0.7)]"
                onClick={(event) => event.stopPropagation()}
            >
                <header className="flex items-center justify-between border-b border-slate-700/80 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <span className="rounded-lg bg-orange-500/15 p-2 text-orange-300">
                            <FaThermometerHalf className="h-4 w-4" />
                        </span>
                        <div>
                            <h2 id="temperature-modal-title" className="text-lg font-semibold text-white">Temperature & cooling</h2>
                            <p className="text-xs text-slate-400">Live processor and fan information</p>
                        </div>
                    </div>
                    <button aria-label="Close temperature information" onClick={onClose} className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-slate-700/70 hover:text-white">
                        <FaTimes className="h-5 w-5" />
                    </button>
                </header>

                <div className="space-y-4 p-5">
                    <div className="rounded-xl border border-slate-700/80 bg-slate-900/55 p-5">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium text-slate-400">Processor temperature</p>
                                <p className="mt-1 text-4xl font-semibold text-white">
                                    {temperature !== null ? `${temperature.toFixed(1)}°C` : '--'}
                                </p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusClasses[details.status] ?? statusClasses.Unavailable}`}>
                                {details.status}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Metric icon={FaFan} label="Fan" value={fanLabel} active={details.fan_running === true} />
                        <Metric icon={FaFan} label="Fan speed" value={details.fan_speed_rpm !== null ? `${details.fan_speed_rpm} RPM` : 'Not reported'} />
                        <Metric icon={FaFire} label="Cooling level" value={coolingLevel} />
                        <Metric icon={FaInfoCircle} label="Sensor" value={details.source ? details.source.split('/').pop() || details.source : 'Unavailable'} />
                    </div>

                    <p className="text-xs leading-5 text-slate-400">
                        Some kiosk fan controllers report only an active cooling level instead of RPM. “Not reported” does not necessarily mean the fan is unavailable.
                    </p>
                </div>
            </section>
        </div>,
        document.body
    );
}

function Metric({ icon: Icon, label, value, active = false }: { icon: typeof FaFan; label: string; value: string; active?: boolean }) {
    return (
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                <Icon className={active ? 'animate-spin text-emerald-300 [animation-duration:1.5s]' : 'text-slate-400'} />
                {label}
            </div>
            <p className="mt-2 text-sm font-semibold text-white">{value}</p>
        </div>
    );
}
