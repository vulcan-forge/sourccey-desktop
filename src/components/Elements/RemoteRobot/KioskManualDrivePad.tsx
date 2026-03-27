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

type DrivePadMode = 'hold' | 'tap';

type DriveButtonConfig = {
    id: string;
    label: string;
    keys: ManualDriveKey[];
    icon?: React.ReactNode;
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

const ALL_BUTTONS: DriveButtonConfig[] = [...DIRECTION_BUTTONS, ...TURN_BUTTONS, ...Z_BUTTONS];
const BUTTON_BY_ID: Record<string, DriveButtonConfig> = ALL_BUTTONS.reduce(
    (acc, button) => {
        acc[button.id] = button;
        return acc;
    },
    {} as Record<string, DriveButtonConfig>
);

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
    const [drivePadMode, setDrivePadMode] = useState<DrivePadMode>('hold');
    const pressedKeys = useMemo(() => getPressedManualDriveKeys(sourceMap), [sourceMap]);
    const pressedKeysRef = useRef<ManualDriveKey[]>([]);
    const holdPointerDownRef = useRef(false);
    const holdPointerIdRef = useRef<number | null>(null);
    const activeHoldButtonIdRef = useRef<string | null>(null);

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
    });

    const setHoldActiveButton = (buttonId: string | null) => {
        if (activeHoldButtonIdRef.current === buttonId) {
            return;
        }

        activeHoldButtonIdRef.current = buttonId;
        setSourceMap((prev) => {
            const cleared = clearButtonSources(prev);
            if (!buttonId) {
                return cleared;
            }
            const button = BUTTON_BY_ID[buttonId];
            if (!button) {
                return cleared;
            }
            return pressManualDriveKeys(cleared, `btn:${button.id}`, button.keys);
        });
    };

    const releaseHoldState = () => {
        holdPointerDownRef.current = false;
        holdPointerIdRef.current = null;
        setHoldActiveButton(null);
    };

    const resolveButtonIdFromPoint = (x: number, y: number): string | null => {
        const element = document.elementFromPoint(x, y);
        if (!element) {
            return null;
        }
        const buttonElement = element.closest<HTMLElement>('[data-manual-button-id]');
        return buttonElement?.dataset.manualButtonId || null;
    };

    useEffect(() => {
        releaseHoldState();
    }, [drivePadMode]);

    useEffect(() => {
        if (drivePadMode !== 'hold') {
            return;
        }

        const onPointerMove = (event: PointerEvent) => {
            if (!holdPointerDownRef.current) {
                return;
            }
            if (holdPointerIdRef.current !== null && holdPointerIdRef.current !== event.pointerId) {
                return;
            }
            const nextButtonId = resolveButtonIdFromPoint(event.clientX, event.clientY);
            setHoldActiveButton(nextButtonId);
        };

        window.addEventListener('pointermove', onPointerMove, { passive: true });
        window.addEventListener('pointerup', releaseHoldState);
        window.addEventListener('pointercancel', releaseHoldState);
        window.addEventListener('touchend', releaseHoldState);
        window.addEventListener('touchcancel', releaseHoldState);
        window.addEventListener('blur', releaseHoldState);

        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', releaseHoldState);
            window.removeEventListener('pointercancel', releaseHoldState);
            window.removeEventListener('touchend', releaseHoldState);
            window.removeEventListener('touchcancel', releaseHoldState);
            window.removeEventListener('blur', releaseHoldState);
        };
    }, [drivePadMode]);

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

    const renderButton = (button: DriveButtonConfig) => (
        <button
            key={button.id}
            data-manual-button-id={button.id}
            type="button"
            onClick={drivePadMode === 'tap' ? () => toggleTapButton(button.id, button.keys) : undefined}
            onPointerDown={
                drivePadMode === 'hold'
                    ? (event) => {
                          event.preventDefault();
                          holdPointerDownRef.current = true;
                          holdPointerIdRef.current = event.pointerId;
                          setHoldActiveButton(button.id);
                      }
                    : undefined
            }
            onPointerEnter={
                drivePadMode === 'hold'
                    ? (event) => {
                          if (!holdPointerDownRef.current) {
                              return;
                          }
                          if (holdPointerIdRef.current !== null && holdPointerIdRef.current !== event.pointerId) {
                              return;
                          }
                          setHoldActiveButton(button.id);
                      }
                    : undefined
            }
            onPointerLeave={
                drivePadMode === 'hold'
                    ? (event) => {
                          if (holdPointerIdRef.current !== null && holdPointerIdRef.current !== event.pointerId) {
                              return;
                          }
                          setHoldActiveButton(null);
                      }
                    : undefined
            }
            onPointerUp={
                drivePadMode === 'hold'
                    ? (event) => {
                          if (holdPointerIdRef.current !== null && holdPointerIdRef.current !== event.pointerId) {
                              return;
                          }
                          releaseHoldState();
                      }
                    : undefined
            }
            onPointerCancel={
                drivePadMode === 'hold'
                    ? (event) => {
                          if (holdPointerIdRef.current !== null && holdPointerIdRef.current !== event.pointerId) {
                              return;
                          }
                          releaseHoldState();
                      }
                    : undefined
            }
            onContextMenu={(event) => event.preventDefault()}
            className={`flex h-16 items-center justify-center rounded-lg border-2 text-sm font-semibold transition-colors select-none ${
                isButtonActive(button.id, button.keys)
                    ? 'border-yellow-400 bg-yellow-500/20 text-yellow-100'
                    : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500 hover:bg-slate-700'
            }`}
            style={drivePadMode === 'hold' ? { touchAction: 'none' } : undefined}
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
                        {drivePadMode === 'hold'
                            ? 'Hold mode: press and hold buttons to move, release to stop.'
                            : 'Tap mode: tap once to latch motion, tap again to release.'}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="inline-flex overflow-hidden rounded-lg border border-slate-600 bg-slate-800">
                        <button
                            type="button"
                            onClick={() => setDrivePadMode('hold')}
                            className={`px-3 py-1 text-xs font-semibold transition-colors ${
                                drivePadMode === 'hold' ? 'bg-yellow-500/20 text-yellow-100' : 'text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            Hold
                        </button>
                        <button
                            type="button"
                            onClick={() => setDrivePadMode('tap')}
                            className={`px-3 py-1 text-xs font-semibold transition-colors ${
                                drivePadMode === 'tap' ? 'bg-yellow-500/20 text-yellow-100' : 'text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            Tap/Untap
                        </button>
                    </div>
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
                <div className="flex items-center justify-center rounded-lg border-2 border-slate-700 bg-slate-900 text-xs text-slate-400">
                    {drivePadMode === 'hold' ? 'HOLD TO MOVE' : 'TAP TO LATCH'}
                </div>
                {renderButton(DIRECTION_BUTTONS[4]!)}
                {renderButton(DIRECTION_BUTTONS[5]!)}
                {renderButton(DIRECTION_BUTTONS[6]!)}
                {renderButton(DIRECTION_BUTTONS[7]!)}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">{TURN_BUTTONS.map(renderButton)}</div>

            <div className="mt-3 grid grid-cols-2 gap-2">{Z_BUTTONS.map(renderButton)}</div>
        </div>
    );
};
