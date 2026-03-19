'use client';

import { FaArrowLeft } from 'react-icons/fa';
import { calculateBatteryPercent, type BatteryData } from '@/hooks/System/system-info.hook';

interface BatteryDetailsViewProps {
    batteryData: BatteryData;
    onBack: () => void;
}

const formatValue = (value: number, digits = 2, unit?: string) => {
    if (!Number.isFinite(value) || value === -1) {
        return '--';
    }

    const rendered = digits === 0 ? Math.round(value).toString() : value.toFixed(digits);
    return unit ? `${rendered} ${unit}` : rendered;
};

export const BatteryDetailsView = ({ batteryData, onBack }: BatteryDetailsViewProps) => {
    const batteryPercent = calculateBatteryPercent(batteryData);
    const batteryPercentString = batteryPercent >= 0 ? `${batteryPercent}%` : 'Off';
    const current = Number.isFinite(batteryData.current_a) ? batteryData.current_a : -1;
    const chargingStatus = current > 0.05 ? 'Charging' : current < -0.05 ? 'Discharging' : 'Idle';
    const details = [
        { label: 'Battery Level', value: batteryPercentString },
        { label: 'State of Charge', value: formatValue(batteryData.state_of_charge, 0, '%') },
        { label: 'Voltage', value: formatValue(batteryData.voltage, 2, 'V') },
        { label: 'Current', value: formatValue(batteryData.current_a, 2, 'A') },
        { label: 'Remaining Capacity', value: formatValue(batteryData.remaining_capacity_ah, 2, 'Ah') },
        { label: 'Max Capacity', value: formatValue(batteryData.max_capacity_ah, 2, 'Ah') },
        { label: 'Max Error', value: formatValue(batteryData.max_error, 0, '%') },
        { label: 'Charge Status', value: chargingStatus },
        { label: 'Error', value: batteryData.error?.trim() ? batteryData.error : 'None' },
    ];

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <button
                    onClick={onBack}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
                >
                    <FaArrowLeft className="h-4 w-4" />
                    Back
                </button>
                <h4 className="text-lg font-semibold text-white">Battery Details</h4>
            </div>

            <div className="space-y-3">
                {details.map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                        <span className="text-sm font-medium text-slate-300">{label}</span>
                        <span className="text-sm font-semibold text-white">{value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
