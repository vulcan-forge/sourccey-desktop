'use client';

import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { FaTimes, FaSpinner } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useModalContext } from '@/hooks/Modals/context.hook';

export const KIOSK_PAIRING_MODAL_ID = 'kiosk-pairing-code';

interface KioskPairingInfo {
    code: string;
    expires_at_ms: number;
    service_port: number;
    robot_name: string;
    nickname: string;
    robot_type: string;
}

export const PairingCodeModal = () => {
    const { useGetModal, openModal, closeModal } = useModalContext();
    const { data: modalState }: any = useGetModal(KIOSK_PAIRING_MODAL_ID);
    const [pairingInfo, setPairingInfo] = useState<KioskPairingInfo | null>(null);
    const [isLoadingPairingInfo, setIsLoadingPairingInfo] = useState(false);

    const fetchPairingInfo = useCallback(async () => {
        setIsLoadingPairingInfo(true);
        try {
            const info = await invoke<KioskPairingInfo>('get_kiosk_pairing_info');
            setPairingInfo(info);
        } catch (error) {
            console.error('Failed to fetch pairing code:', error);
            toast.error('Failed to load pairing code');
            setPairingInfo(null);
        } finally {
            setIsLoadingPairingInfo(false);
        }
    }, []);

    useEffect(() => {
        const unlistenPromise = listen('kiosk-pairing-open', () => {
            openModal(KIOSK_PAIRING_MODAL_ID, { source: 'desktop_pairing' });
        });

        return () => {
            void unlistenPromise.then((unlisten) => unlisten());
        };
    }, [openModal]);

    useEffect(() => {
        if (!modalState) return;
        fetchPairingInfo();
        const interval = setInterval(fetchPairingInfo, 30000);
        return () => clearInterval(interval);
    }, [modalState, fetchPairingInfo]);

    if (!modalState) return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-slate-600 bg-slate-800 p-6 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">Pair Robot</h3>
                    <button
                        onClick={() => closeModal(KIOSK_PAIRING_MODAL_ID)}
                        className="cursor-pointer rounded p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                    >
                        <FaTimes className="h-4 w-4" />
                    </button>
                </div>

                {isLoadingPairingInfo ? (
                    <div className="flex items-center gap-2 text-slate-300">
                        <FaSpinner className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Loading pairing code...</span>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="text-sm text-slate-400">Enter this code in the desktop app:</div>
                        <div className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-center font-mono text-4xl font-bold tracking-[0.18em] text-white">
                            {pairingInfo?.code || '------'}
                        </div>
                        <div className="text-xs text-slate-400">
                            {pairingInfo?.expires_at_ms
                                ? `Expires: ${new Date(pairingInfo.expires_at_ms).toLocaleTimeString()}`
                                : 'Pairing code unavailable'}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
