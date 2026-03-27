'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { FaArrowUp, FaArrowDown, FaArrowLeft, FaArrowRight, FaArrowsAltH } from 'react-icons/fa';
import { toastErrorDefaults } from '@/utils/toast/toast-utils';
import { kioskEventManager } from '@/utils/logs/kiosk-logs/kiosk-events';
import {
    createEmptyManualDriveSourceMap,
    getPressedManualDriveKeys,
    pressManualDriveKeys,
    releaseManualDriveKeys,
    type ManualDriveKey,
    type ManualDriveSourceMap,
} from '@/components/Elements/RemoteRobot/manual-drive-keys';

type KioskManualDrivePadProps = {
    nickname: string;
};

type DriveButtonConfig = {
    id: string;
    label: string;
    keys: ManualDriveKey[];
    icon?: React.ReactNode;
};

type SpeedOption = {
    id: 'slow' | 'medium' | 'fast';
    label: string;
    level: 0 | 1 | 2;
};

const DIRECTION_BUTTONS: DriveButtonConfig[] = [
    { id: 'nw', label: 'NW', keys: ['w', 'a'] },
    { id: 'n', label: 'N', keys: ['w'], icon: <FaArrowUp className="h-4 w-4" /> },
    { id: 'ne', label: 'NE', keys: ['w', 'd'] },
    { id: 'w', label: 'W', keys: ['a'], icon: <FaArrowLeft className="h-4 w-4" /> },
    { id: 'e', label: 'E', keys: ['d'], icon: <FaArrowRight className="h-4 w-4" /> },
    { id: 'sw', label: 'SW', keys: ['s', 'a'] },
    { id: 's', label: 'S', keys: ['s'], icon: <FaArrowDown className="h-4 w-4" /> },
    { id: 'se', label: 'SE', keys: ['s', 'd'] },
];

const TURN_BUTTONS: DriveButtonConfig[] = [
    { id: 'turn-left', label: 'Turn Left (Z)', keys: ['z'], icon: <FaArrowsAltH className="h-4 w-4" /> },
    { id: 'turn-right', label: 'Turn Right (X)', keys: ['x'], icon: <FaArrowsAltH className="h-4 w-4" /> },
];

const Z_BUTTONS: DriveButtonConfig[] = [
    { id: 'z-up', label: 'Lift Up (Q)', keys: ['q'], icon: <FaArrowUp className="h-4 w-4" /> },
    { id: 'z-down', label: 'Lift Down (E)', keys: ['e'], icon: <FaArrowDown className="h-4 w-4" /> },
];

const SPEED_OPTIONS: SpeedOption[] = [
    { id: 'slow', label: 'Slow', level: 0 },
    { id: 'medium', label: 'Medium', level: 1 },
    { id: 'fast', label: 'Fast', level: 2 },
];

const MAX_TOAST_CHARS = 140;
const compactError = (error: unknown): string => {
    const base =
        typeof error === 'string'
            ? error
            : error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
              ? (error as { message: string }).message
              : 'Unknown error';
    const firstLine = base.split(/\r?\n/, 1)[0]?.trim() || 'Unknown error';
    const compact = firstLine.replace(/\s+/g, ' ').trim();
    if (compact.length <= MAX_TOAST_CHARS) {
        return compact;
    }
    return `${compact.slice(0, MAX_TOAST_CHARS - 3)}...`;
};

export const KioskManualDrivePad: React.FC<KioskManualDrivePadProps> = ({ nickname }) => {
    const [sourceMap, setSourceMap] = useState<ManualDriveSourceMap>(createEmptyManualDriveSourceMap());
    const [bridgeReady, setBridgeReady] = useState(false);
    const [bridgeStarting, setBridgeStarting] = useState(false);
    const [toastErrorMessage, setToastErrorMessage] = useState<string | null>(null);
    const [speedLevel, setSpeedLevel] = useState<0 | 1 | 2>(1);
    const [armsUntorqued, setArmsUntorqued] = useState(false);
    const pressedKeys = useMemo(() => getPressedManualDriveKeys(sourceMap), [sourceMap]);
    const pressedKeysRef = useRef<ManualDriveKey[]>([]);
    const pulseTimeoutsRef = useRef<number[]>([]);

    const sendPressedKeys = async (keys: ManualDriveKey[]) => {
        try {
            await invoke('set_kiosk_manual_drive_keys', { nickname, keys });
            setToastErrorMessage(null);
        } catch (error) {
            const message = compactError(error);
            if (toastErrorMessage !== message) {
                setToastErrorMessage(message);
                toast.error(`Manual drive update failed: ${message}`, {
                    ...toastErrorDefaults,
                    style: {
                        ...(toastErrorDefaults.style || {}),
                        maxWidth: '420px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    },
                });
            }
        }
    };

    useEffect(() => {
        pressedKeysRef.current = pressedKeys;
    }, [pressedKeys]);

    useEffect(() => {
        let cancelled = false;
        setBridgeStarting(true);
        void invoke<string>('start_kiosk_manual_drive', { nickname })
            .then(() => {
                if (!cancelled) {
                    setBridgeReady(true);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    const message = compactError(error);
                    toast.error(`Failed to start manual drive: ${message}`, {
                        ...toastErrorDefaults,
                    });
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setBridgeStarting(false);
                }
            });

        return () => {
            cancelled = true;
            for (const timeoutId of pulseTimeoutsRef.current) {
                window.clearTimeout(timeoutId);
            }
            pulseTimeoutsRef.current = [];
            void invoke<string>('stop_kiosk_manual_drive', { nickname }).catch(() => {});
        };
    }, [nickname]);

    useEffect(() => {
        if (!bridgeReady) {
            return;
        }

        void sendPressedKeys(pressedKeys);

        if (pressedKeys.length === 0) {
            return;
        }

        const interval = window.setInterval(() => {
            void sendPressedKeys(pressedKeysRef.current);
        }, 100);

        return () => {
            window.clearInterval(interval);
        };
    }, [bridgeReady, pressedKeys]);

    useEffect(() => {
        const unlistenShutdown = kioskEventManager.listenManualDriveShutdown((payload) => {
            if (payload.nickname !== nickname) {
                return;
            }
            setBridgeReady(false);
            setSourceMap(createEmptyManualDriveSourceMap());
            toast.error(`Manual drive process stopped: ${compactError(payload.message || 'Unknown failure')}`, {
                ...toastErrorDefaults,
            });
        });
        return () => {
            unlistenShutdown();
        };
    }, [nickname]);

    const clearButtonSources = (current: ManualDriveSourceMap): ManualDriveSourceMap => ({
        w: current.w.filter((source) => !source.startsWith('btn:')),
        a: current.a.filter((source) => !source.startsWith('btn:')),
        s: current.s.filter((source) => !source.startsWith('btn:')),
        d: current.d.filter((source) => !source.startsWith('btn:')),
        z: current.z.filter((source) => !source.startsWith('btn:')),
        x: current.x.filter((source) => !source.startsWith('btn:')),
        q: current.q.filter((source) => !source.startsWith('btn:')),
        e: current.e.filter((source) => !source.startsWith('btn:')),
        r: current.r.filter((source) => !source.startsWith('btn:')),
        f: current.f.filter((source) => !source.startsWith('btn:')),
        n: current.n.filter((source) => !source.startsWith('btn:')),
        m: current.m.filter((source) => !source.startsWith('btn:')),
    });

    const isButtonActive = (buttonId: string, keys: ManualDriveKey[]) => {
        const sourceId = `btn:${buttonId}`;
        return keys.every((key) => sourceMap[key].includes(sourceId));
    };

    const toggleTapButton = (buttonId: string, keys: ManualDriveKey[]) => {
        const sourceId = `btn:${buttonId}`;
        setSourceMap((prev) => {
            const engaged = keys.every((key) => prev[key].includes(sourceId));
            if (engaged) {
                return releaseManualDriveKeys(prev, sourceId, keys);
            }

            // Button latch is mutually exclusive: selecting one button clears any other latched button.
            const cleared = clearButtonSources(prev);
            return pressManualDriveKeys(cleared, sourceId, keys);
        });
    };

    const pulseKeys = (keys: ManualDriveKey[], sourceId: string, holdMs = 180) => {
        setSourceMap((prev) => pressManualDriveKeys(prev, sourceId, keys));
        const timeoutId = window.setTimeout(() => {
            setSourceMap((prev) => releaseManualDriveKeys(prev, sourceId, keys));
        }, holdMs);
        pulseTimeoutsRef.current.push(timeoutId);
    };

    const queuePulse = (keys: ManualDriveKey[], sourceId: string, delayMs: number) => {
        const timeoutId = window.setTimeout(() => {
            pulseKeys(keys, sourceId);
        }, delayMs);
        pulseTimeoutsRef.current.push(timeoutId);
    };

    const setSpeedByLevel = (nextLevel: 0 | 1 | 2) => {
        if (nextLevel === speedLevel) {
            return;
        }

        const diff = nextLevel - speedLevel;
        const key: ManualDriveKey = diff > 0 ? 'r' : 'f';
        const steps = Math.abs(diff);
        for (let i = 0; i < steps; i += 1) {
            queuePulse([key], `spd:${nextLevel}:${i}:${Date.now()}`, i * 140);
        }
        setSpeedLevel(nextLevel);
    };

    const setArmsTorqueMode = (targetUntorqued: boolean) => {
        const stamp = Date.now();
        const key: ManualDriveKey = targetUntorqued ? 'n' : 'm';
        pulseKeys([key], `torque:${key}:${stamp}`);
        setArmsUntorqued(targetUntorqued);
    };

    const renderButton = (button: DriveButtonConfig) => (
        <button
            key={button.id}
            type="button"
            onClick={() => toggleTapButton(button.id, button.keys)}
            onDragStart={(event) => event.preventDefault()}
            onContextMenu={(event) => event.preventDefault()}
            className={`flex h-16 items-center justify-center rounded-lg border-2 text-sm font-semibold transition-colors select-none ${
                isButtonActive(button.id, button.keys)
                    ? 'border-yellow-400 bg-yellow-500/20 text-yellow-100'
                    : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500 hover:bg-slate-700'
            }`}
        >
            <span className="inline-flex items-center gap-2">
                {button.icon}
                {button.label}
            </span>
        </button>
    );

    return (
        <div className="mt-4 rounded-xl border-2 border-slate-700 bg-slate-800/60 p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">Manual Control</h3>
                    <p className="mt-1 text-sm text-slate-300">
                        Tap a direction to latch movement. Tap the same button again to stop.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                        {bridgeStarting ? 'Starting...' : bridgeReady ? 'Ready' : 'Offline'}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {renderButton(DIRECTION_BUTTONS[0]!)}
                {renderButton(DIRECTION_BUTTONS[1]!)}
                {renderButton(DIRECTION_BUTTONS[2]!)}
                {renderButton(DIRECTION_BUTTONS[3]!)}
                <div className="flex items-center justify-center rounded-lg border-2 border-slate-600 bg-slate-900/80 px-2 text-center">
                    <span className="rounded-full border border-indigo-500/40 bg-indigo-500/15 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100">
                        Tap to Latch
                    </span>
                </div>
                {renderButton(DIRECTION_BUTTONS[4]!)}
                {renderButton(DIRECTION_BUTTONS[5]!)}
                {renderButton(DIRECTION_BUTTONS[6]!)}
                {renderButton(DIRECTION_BUTTONS[7]!)}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">{TURN_BUTTONS.map(renderButton)}</div>

            <div className="mt-3 grid grid-cols-2 gap-2">{Z_BUTTONS.map(renderButton)}</div>

            <div className="mt-6 grid grid-cols-3 gap-2">
                {SPEED_OPTIONS.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        onClick={() => setSpeedByLevel(option.level)}
                        className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-colors ${
                            speedLevel === option.level
                                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100'
                                : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500 hover:bg-slate-700'
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={() => setArmsTorqueMode(false)}
                    className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-colors ${
                        !armsUntorqued
                            ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                            : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500 hover:bg-slate-700'
                    }`}
                >
                    Torque Arms (M)
                </button>
                <button
                    type="button"
                    onClick={() => setArmsTorqueMode(true)}
                    className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-colors ${
                        armsUntorqued
                            ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                            : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500 hover:bg-slate-700'
                    }`}
                >
                    Untorque Arms (N)
                </button>
            </div>
        </div>
    );
};
