import { createPortal } from 'react-dom';
import { FaTimes, FaCircle, FaBatteryHalf, FaWifi } from 'react-icons/fa';
import type { BatteryData } from '@/app/app/settings/page';
interface RobotStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    systemInfo: {
        ipAddress: string;
        temperature: string;
        batteryData: BatteryData;
    };
    isHostReady: boolean;
}

export const RobotStatusModal = ({ isOpen, onClose, systemInfo, isHostReady }: RobotStatusModalProps) => {
    if (!isOpen) return null;

    return (
        typeof window !== 'undefined' &&
        createPortal(
            <div
                className="fixed inset-0 z-[2000] flex cursor-pointer items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
                onClick={onClose}
            >
                <div
                    className="relative max-h-[80vh] w-[90vw] max-w-md cursor-default overflow-auto rounded-lg border border-slate-600 bg-slate-800 p-6 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-xl font-semibold text-white">Robot Status</h3>
                        <button
                            onClick={onClose}
                            className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                        >
                            <FaTimes className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="flex items-center gap-3">
                                <div className={`${isHostReady ? 'text-green-400' : 'text-slate-500'}`}>
                                    <FaCircle />
                                </div>
                                <span className="text-sm font-medium text-slate-300">Robot Status</span>
                            </div>
                            <div className={`text-sm font-semibold ${isHostReady ? 'text-green-400' : 'text-slate-500'}`}>
                                {isHostReady ? 'Online' : 'Inactive'}
                            </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="flex items-center gap-3">
                                <div className="text-slate-400">
                                    <FaBatteryHalf />
                                </div>
                                <span className="text-sm font-medium text-slate-300">Battery Life</span>
                            </div>
                            <div
                                className={`text-sm font-semibold ${
                                    systemInfo.batteryData.percent > 50
                                        ? 'text-green-400'
                                        : systemInfo.batteryData.percent > 20
                                          ? 'text-slate-300'
                                          : 'text-red-400'
                                }`}
                            >
                                {systemInfo.batteryData.percent >= 0 ? `${systemInfo.batteryData.percent}%` : 'N/A'}
                            </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="flex items-center gap-3">
                                <div className="text-slate-400">
                                    <FaWifi />
                                </div>
                                <span className="text-sm font-medium text-slate-300">IP Address</span>
                            </div>
                            <div className="text-sm font-semibold text-slate-300">{systemInfo.ipAddress}</div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                            <div className="flex items-center gap-3">
                                <div className="text-slate-400"></div>
                                <span className="text-sm font-medium text-slate-300">Temperature</span>
                            </div>
                            <div className="text-sm font-semibold text-slate-300">{systemInfo.temperature}</div>
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        )
    );
};
