'use client';

import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { FaPowerOff } from 'react-icons/fa';
import { useRobotStatus } from '@/context/robot-status-context';
import { toastErrorDefaults, toastInfoDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';

type RobotUntorqueSectionProps = {
    nickname?: string;
    isStarting: boolean;
    isStopping: boolean;
};

export const RobotUntorqueSection = ({ nickname, isStarting, isStopping }: RobotUntorqueSectionProps) => {
    const { setIsRobotStarted } = useRobotStatus();
    const [isUntorquing, setIsUntorquing] = useState(false);

    const handleUntorqueArms = async () => {
        if (!nickname || isStarting || isStopping || isUntorquing) {
            return;
        }

        setIsUntorquing(true);
        setIsRobotStarted(false);
        toast.info('Stopping host if needed, then untorquing both arms...', { ...toastInfoDefaults });

        try {
            const message = await invoke<string>('untorque_kiosk_robot_arms', { nickname });
            toast.success(message || 'Untorqued both arms.', { ...toastSuccessDefaults });
        } catch (error) {
            const message =
                typeof error === 'string'
                    ? error
                    : error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
                      ? (error as { message: string }).message
                      : 'Unknown error';
            toast.error(`Failed to untorque arms: ${message}`, { ...toastErrorDefaults });
        } finally {
            setIsUntorquing(false);
            setIsRobotStarted(false);
        }
    };

    return (
        <div className="mt-4 flex flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800/60 p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">Arm Torque</h3>
                    <p className="mt-1 text-sm text-slate-300">
                        Untorque both arms for manual repositioning. If the host is running, it will be stopped first so the arm serial ports can be reopened safely.
                    </p>
                </div>
                <div className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                    {isUntorquing ? 'Untorquing...' : 'Ready'}
                </div>
            </div>

            <button
                type="button"
                onClick={() => {
                    void handleUntorqueArms();
                }}
                disabled={!nickname || isStarting || isStopping || isUntorquing}
                className={`inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl px-6 py-2 text-lg transition-all sm:max-w-80 ${
                    !nickname || isStarting || isStopping || isUntorquing
                        ? 'cursor-not-allowed bg-amber-500 text-white opacity-60'
                        : 'cursor-pointer bg-amber-500 text-slate-950 hover:bg-amber-400 active:bg-amber-300'
                }`}
            >
                {isUntorquing ? (
                    <>
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent"></div>
                        Untorquing...
                    </>
                ) : (
                    <>
                        <FaPowerOff className="h-5 w-5" /> Untorque Arms
                    </>
                )}
            </button>
        </div>
    );
};
