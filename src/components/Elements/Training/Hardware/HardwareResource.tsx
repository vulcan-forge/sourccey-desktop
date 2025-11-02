import React from 'react';
import { FaThermometerHalf, FaMemory, FaMicrochip } from 'react-icons/fa';

interface HardwareResource {
    id: string;
    name: string;
    memory?: number;
    memoryUsed?: number;
    utilization: number;
    temperature: number;
    cores?: number;
}

interface HardwareResourceProps {
    resource: HardwareResource;
    isSelected: boolean;
    onClick: () => void;
    type: 'gpu' | 'cpu';
}

const getUtilizationColor = (utilization: number) => {
    if (utilization > 80) return 'text-red-400';
    if (utilization > 60) return 'text-yellow-400';
    if (utilization > 20) return 'text-green-400';
    return 'text-slate-400';
};

const getTemperatureColor = (temp: number) => {
    if (temp > 80) return 'text-red-400';
    if (temp > 70) return 'text-yellow-400';
    return 'text-green-400';
};

export const GPUResource: React.FC<HardwareResourceProps> = ({ resource, isSelected, onClick, type }) => {
    const borderColor = isSelected ? 'border-yellow-400/50 bg-yellow-500/10' : 'border-slate-600/30 bg-slate-700/30 hover:border-slate-500/50';
    const iconColor = resource.utilization > 0 ? 'text-yellow-400' : 'text-slate-500';

    console.log(resource.memory && resource.memoryUsed);
    console.log('resource.memory', resource.memory);
    console.log('resource.memoryUsed', resource.memoryUsed);
    const isGPUActive =
        resource && resource.memory !== undefined && resource.memoryUsed !== undefined && resource.memoryUsed > 0 && resource.memory > 0;
    return (
        <div
            onClick={onClick}
            className={`relative cursor-pointer rounded-lg border p-3 transition-all duration-200 hover:shadow-md ${borderColor}`}
        >
            <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FaMicrochip className={`text-sm ${iconColor}`} />
                    <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-medium text-white">{resource.name}</h4>
                        <p className="truncate text-xs text-slate-400">{resource.id}</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className={`text-sm font-semibold ${getUtilizationColor(resource.utilization)}`}>{resource.utilization}%</div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1">
                    <FaMemory className="text-slate-400" />
                    <span className="text-slate-300">
                        {resource.memoryUsed?.toFixed(1)}/{resource.memory}GB
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <FaThermometerHalf className={getTemperatureColor(resource.temperature)} />
                    <span className={getTemperatureColor(resource.temperature)}>{resource.temperature}°C</span>
                </div>
            </div>

            {/* Progress bar for memory usage */}
            <div className="mt-2">
                <div className="h-1 w-full rounded-full bg-slate-600">
                    {isGPUActive && resource.memory && resource.memoryUsed && (
                        <div
                            className="h-1 rounded-full bg-blue-400 transition-all duration-300"
                            style={{ width: `${(resource.memoryUsed / resource.memory) * 100}%` }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export const CPUResource: React.FC<HardwareResourceProps> = ({ resource, isSelected, onClick, type }) => {
    const borderColor = isSelected ? 'border-orange-400/50 bg-orange-500/10' : 'border-slate-600/30 bg-slate-700/30 hover:border-slate-500/50';
    const iconColor = resource.utilization > 0 ? 'text-orange-400' : 'text-slate-500';

    return (
        <div
            onClick={onClick}
            className={`relative cursor-pointer rounded-lg border p-3 transition-all duration-200 hover:shadow-md ${borderColor}`}
        >
            <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FaMicrochip className={`text-sm ${iconColor}`} />
                    <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-medium text-white">{resource.name}</h4>
                        <p className="truncate text-xs text-slate-400">
                            {resource.id} • {resource.cores} cores
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <div className={`text-sm font-semibold ${getUtilizationColor(resource.utilization)}`}>{resource.utilization}%</div>
                </div>
            </div>

            <div className="mb-2 flex items-center gap-2 text-xs">
                <FaThermometerHalf className={getTemperatureColor(resource.temperature)} />
                <span className={getTemperatureColor(resource.temperature)}>{resource.temperature}°C</span>
            </div>

            {/* Progress bar for CPU utilization */}
            <div className="h-1 w-full rounded-full bg-slate-600">
                <div className="h-1 rounded-full bg-orange-400 transition-all duration-300" style={{ width: `${resource.utilization}%` }} />
            </div>
        </div>
    );
};
