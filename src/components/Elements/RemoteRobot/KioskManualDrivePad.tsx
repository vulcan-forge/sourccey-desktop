'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { FaArrowUp, FaArrowDown, FaArrowLeft, FaArrowRight, FaArrowsAltH, FaPlay, FaStop } from 'react-icons/fa';
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
const CONTINUOUS_DRIVE_KEYS: ReadonlySet<ManualDriveKey> = new Set(['w', 'a', 's', 'd', 'z', 'x', 'q', 'e']);

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
    const [bridgeStopping, setBridgeStopping] = useState(false);
    const [toastErrorMessage, setToastErrorMessage] = useState<string | null>(null);
    const [speedLevel, setSpeedLevel] = useState<0 | 1 | 2>(1);
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

    const startManualDrive = useCallback(async () => {
        if (bridgeReady || bridgeStarting || bridgeStopping) {
            return;
        }
        setBridgeStarting(true);
        try {
            await invoke<string>('start_kiosk_manual_drive', { nickname });
            setBridgeReady(true);
            setToastErrorMessage(null);
        } catch (error) {
            const message = compactError(error);
            toast.error(`Failed to start manual drive: ${message}`, {
                ...toastErrorDefaults,
            });
        } finally {
            setBridgeStarting(false);
        }
    }, [bridgeReady, bridgeStarting, bridgeStopping, nickname]);

    const stopManualDrive = useCallback(async () => {
        if ((!bridgeReady && !bridgeStarting) || bridgeStopping) {
            return;
        }
        setBridgeStopping(true);
        try {
            await invoke<string>('stop_kiosk_manual_drive', { nickname });
        } catch (error) {
            const message = compactError(error);
            toast.error(`Failed to stop manual drive: ${message}`, {
                ...toastErrorDefaults,
            });
        } finally {
            for (const timeoutId of pulseTimeoutsRef.current) {
                window.clearTimeout(timeoutId);
            }
            pulseTimeoutsRef.current = [];
            setBridgeStarting(false);
            setBridgeReady(false);
            setSourceMap(createEmptyManualDriveSourceMap());
            setBridgeStopping(false);
        }
    }, [bridgeReady, bridgeStarting, bridgeStopping, nickname]);

    useEffect(() => {
        return () => {
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

        const hasContinuousKey = pressedKeys.some((key) => CONTINUOUS_DRIVE_KEYS.has(key));
        if (!hasContinuousKey) {
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
            setBridgeStarting(false);
            setBridgeStopping(false);
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
                        Start manual control to enable the drive bridge. Stop it before connecting a teleoperator.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            if (bridgeReady || bridgeStarting) {
                                void stopManualDrive();
                                return;
                            }
                            void startManualDrive();
                        }}
                        disabled={bridgeStarting || bridgeStopping}
                        className={`inline-flex min-w-52 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                            bridgeStarting || bridgeStopping
                                ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                                : bridgeReady
                                  ? 'cursor-pointer bg-red-500 text-white hover:bg-red-600'
                                  : 'cursor-pointer bg-green-600 text-white hover:bg-green-700'
                        }`}
                    >
                        {bridgeStarting ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Starting...
                            </>
                        ) : bridgeStopping ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Stopping...
                            </>
                        ) : bridgeReady ? (
                            <>
                                <FaStop className="h-4 w-4" /> Stop Manual Control
                            </>
                        ) : (
                            <>
                                <FaPlay className="h-4 w-4" /> Start Manual Control
                            </>
                        )}
                    </button>
                    <div className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                        {bridgeStarting ? 'Starting...' : bridgeStopping ? 'Stopping...' : bridgeReady ? 'Ready' : 'Offline'}
                    </div>
                </div>
            </div>

            {bridgeReady ? (
                <>
                    <div className="grid grid-cols-3 gap-2">
                        {renderButton(DIRECTION_BUTTONS[0]!)}
                        {renderButton(DIRECTION_BUTTONS[1]!)}
                        {renderButton(DIRECTION_BUTTONS[2]!)}
                        {renderButton(DIRECTION_BUTTONS[3]!)}
                        <div className="flex items-center justify-center rounded-lg border-2 border-slate-700 bg-slate-900 px-2 text-center">
                            <span className="text-xs font-semibold tracking-wide text-slate-300 uppercase">Tap to Latch</span>
                        </div>
                        {renderButton(DIRECTION_BUTTONS[4]!)}
                        {renderButton(DIRECTION_BUTTONS[5]!)}
                        {renderButton(DIRECTION_BUTTONS[6]!)}
                        {renderButton(DIRECTION_BUTTONS[7]!)}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">{TURN_BUTTONS.map(renderButton)}</div>

                    <div className="mt-3 grid grid-cols-2 gap-2">{Z_BUTTONS.map(renderButton)}</div>

                    <div className="mt-8 grid grid-cols-3 gap-2">
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
                </>
            ) : (
                <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
                    Manual driving controls are hidden until you start manual control.
                </div>
            )}
        </div>
    );
};
