'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { FaArrowUp, FaArrowDown, FaArrowLeft, FaArrowRight, FaArrowsAltH } from 'react-icons/fa';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { kioskEventManager } from '@/utils/logs/kiosk-logs/kiosk-events';
import {
    createEmptyManualDriveSourceMap,
    getPressedManualDriveKeys,
    normalizeManualDriveKey,
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

const MAX_TOAST_CHARS = 140;
const compactError = (error: unknown): string => {
    const base = typeof error === 'string'
        ? error
        : error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
          ? ((error as { message: string }).message)
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
    const pressedKeys = useMemo(() => getPressedManualDriveKeys(sourceMap), [sourceMap]);
    const pressedKeysRef = useRef<ManualDriveKey[]>([]);

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
        const releaseAll = () => setSourceMap(createEmptyManualDriveSourceMap());
        const onKeyDown = (event: KeyboardEvent) => {
            const key = normalizeManualDriveKey(event.key);
            if (!key) {
                return;
            }
            event.preventDefault();
            setSourceMap((prev) => pressManualDriveKeys(prev, `kbd:${key}`, [key]));
        };

        const onKeyUp = (event: KeyboardEvent) => {
            const key = normalizeManualDriveKey(event.key);
            if (!key) {
                return;
            }
            event.preventDefault();
            setSourceMap((prev) => releaseManualDriveKeys(prev, `kbd:${key}`, [key]));
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', releaseAll);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', releaseAll);
        };
    }, []);

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

    const isButtonLatched = (buttonId: string, keys: ManualDriveKey[]) => {
        const sourceId = `btn:${buttonId}`;
        return keys.every((key) => sourceMap[key].includes(sourceId));
    };

    const toggleButton = (buttonId: string, keys: ManualDriveKey[]) => {
        const sourceId = `btn:${buttonId}`;
        setSourceMap((prev) => {
            const engaged = keys.every((key) => prev[key].includes(sourceId));
            if (engaged) {
                return releaseManualDriveKeys(prev, sourceId, keys);
            }

            // Button latch is mutually exclusive: selecting one button clears any other latched button.
            const cleared: ManualDriveSourceMap = {
                w: prev.w.filter((source) => !source.startsWith('btn:')),
                a: prev.a.filter((source) => !source.startsWith('btn:')),
                s: prev.s.filter((source) => !source.startsWith('btn:')),
                d: prev.d.filter((source) => !source.startsWith('btn:')),
                z: prev.z.filter((source) => !source.startsWith('btn:')),
                x: prev.x.filter((source) => !source.startsWith('btn:')),
                q: prev.q.filter((source) => !source.startsWith('btn:')),
                e: prev.e.filter((source) => !source.startsWith('btn:')),
            };

            return pressManualDriveKeys(cleared, sourceId, keys);
        });
    };

    const renderButton = (button: DriveButtonConfig) => (
        <button
            key={button.id}
            type="button"
            onClick={() => toggleButton(button.id, button.keys)}
            className={`flex h-16 select-none items-center justify-center rounded-lg border-2 text-sm font-semibold transition-colors ${
                isButtonLatched(button.id, button.keys)
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
                    <h3 className="text-lg font-semibold text-white">Manual Wheel Control</h3>
                    <p className="mt-1 text-sm text-slate-300">
                        Tap a button to latch motion, tap again to release. Keyboard still uses hold behavior (WASD, Z/X, Q/E).
                    </p>
                </div>
                <div className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                    {bridgeStarting ? 'Starting...' : bridgeReady ? 'Ready' : 'Offline'}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {renderButton(DIRECTION_BUTTONS[0])}
                {renderButton(DIRECTION_BUTTONS[1])}
                {renderButton(DIRECTION_BUTTONS[2])}
                {renderButton(DIRECTION_BUTTONS[3])}
                <div className="flex items-center justify-center rounded-lg border-2 border-slate-700 bg-slate-900 text-xs text-slate-400">
                    TAP TO LATCH
                </div>
                {renderButton(DIRECTION_BUTTONS[4])}
                {renderButton(DIRECTION_BUTTONS[5])}
                {renderButton(DIRECTION_BUTTONS[6])}
                {renderButton(DIRECTION_BUTTONS[7])}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
                {TURN_BUTTONS.map(renderButton)}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
                {Z_BUTTONS.map(renderButton)}
            </div>
        </div>
    );
};

