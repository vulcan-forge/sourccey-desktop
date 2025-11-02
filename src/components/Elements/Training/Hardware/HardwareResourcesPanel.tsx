import React from 'react';
import { FaServer, FaMicrochip } from 'react-icons/fa';
import { GPUResource, CPUResource } from './HardwareResource';

interface HardwareResource {
    id: string;
    name: string;
    memory?: number;
    memoryUsed?: number;
    utilization: number;
    temperature: number;
    cores?: number;
}

interface HardwareResources {
    gpus: HardwareResource[];
    cpus: HardwareResource[];
}

interface HardwareResourcesPanelProps {
    resources: HardwareResources;
    selectedHardware: string[];
    onHardwareSelect: (hardwareIds: string[]) => void;
}

export const HardwareResourcesPanel: React.FC<HardwareResourcesPanelProps> = ({ resources, selectedHardware, onHardwareSelect }) => {
    const handleHardwareClick = (hardwareId: string) => {
        const isSelected = selectedHardware.includes(hardwareId);
        if (isSelected) {
            onHardwareSelect(selectedHardware.filter((id) => id !== hardwareId));
        } else {
            onHardwareSelect([...selectedHardware, hardwareId]);
        }
    };

    // Split GPUs into 2 rows for better horizontal layout
    const gpusPerRow = Math.ceil(resources.gpus.length);
    const gpuRow1 = resources.gpus.slice(0, gpusPerRow);
    // const gpuRow2 = resources.gpus.slice(gpusPerRow);

    return (
        <div className="flex flex-col gap-4 rounded-xl border border-slate-600/50 bg-slate-800/50 p-6 shadow-lg">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Hardware Resources</h2>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <FaServer className="text-sm" />
                    <span>Select resources for training</span>
                </div>
            </div>

            {/* GPUs Section - Horizontal Layout */}
            <div className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                    <FaMicrochip className="text-yellow-400" />
                    GPUs
                </h3>

                {/* First row of GPUs */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {gpuRow1.map((gpu) => (
                        <GPUResource
                            key={gpu.id}
                            resource={gpu}
                            isSelected={selectedHardware.includes(gpu.id)}
                            onClick={() => handleHardwareClick(gpu.id)}
                            type="gpu"
                        />
                    ))}
                </div>
            </div>

            {/* CPUs Section - Compact Horizontal Layout */}
            <div className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                    <FaMicrochip className="text-orange-400" />
                    CPUs
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {resources.cpus.map((cpu) => (
                        <CPUResource
                            key={cpu.id}
                            resource={cpu}
                            isSelected={selectedHardware.includes(cpu.id)}
                            onClick={() => handleHardwareClick(cpu.id)}
                            type="cpu"
                        />
                    ))}
                </div>
            </div>

            {selectedHardware.length > 0 && (
                <div className="rounded-lg border border-yellow-400/30 bg-yellow-500/10 p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-yellow-200">Selected Resources:</span>
                            <div className="flex flex-wrap gap-2">
                                {selectedHardware.map((id) => (
                                    <span key={id} className="rounded-md bg-yellow-500/20 px-2 py-1 text-xs font-medium text-yellow-300">
                                        {id}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <button onClick={() => onHardwareSelect([])} className="text-xs text-yellow-400 hover:text-yellow-300">
                            Clear Selection
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
