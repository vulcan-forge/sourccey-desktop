import type { SystemInfo } from '@/hooks/System/system-info.hook';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';

interface CredentialsModalProps {
    isOpen: boolean;
    onClose: () => void;
    systemInfo: SystemInfo;
    piCredentials: {
        username: string;
        password: string;
    };
    isFetchingCreds: boolean;
}

export const CredentialsModal = ({ isOpen, onClose, systemInfo, piCredentials, isFetchingCreds }: CredentialsModalProps) => {
    if (!isOpen) return null;
    if (typeof window === 'undefined') return null;
    return createPortal(
        <div
            className="fixed inset-0 z-[2000] flex cursor-pointer items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative max-h-[80vh] w-[90vw] max-w-md cursor-default overflow-auto rounded-lg border border-slate-600 bg-slate-800 p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-white">Device Credentials</h3>
                    <button
                        onClick={onClose}
                        className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                    >
                        <FaTimes className="h-5 w-5" />
                    </button>
                </div>
                <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                        <span className="text-sm font-medium text-slate-300">IP Address</span>
                        <span className="text-sm font-semibold text-slate-300">{systemInfo.ipAddress}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                        <span className="text-sm font-medium text-slate-300">Username</span>
                        <span className="text-sm font-semibold text-slate-300">{isFetchingCreds ? 'Loading…' : piCredentials.username}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                        <span className="text-sm font-medium text-slate-300">Password</span>
                        <span className="text-sm font-semibold text-slate-300">{isFetchingCreds ? 'Loading…' : piCredentials.password}</span>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
