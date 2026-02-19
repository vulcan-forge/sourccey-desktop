import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useRobotStatus } from '@/context/robot-status-context';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastInfoDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { kioskEventManager } from '@/utils/logs/kiosk-logs/kiosk-events';

export const useKioskRobotStartStop = (nickname: string) => {
    const POST_STOP_TAP_GUARD_MS = 800;
    const { isRobotStarted, setIsRobotStarted } = useRobotStatus();
    const [isStarting, setIsStarting] = useState(false);
    const [isStopping, setIsStopping] = useState(false);
    const stopActionLockRef = useRef(false);
    const postStopGuardUntilRef = useRef(0);
    const lastToastMessageRef = useRef<string | null>(null);
    const suppressAutoStartingRef = useRef(false);
    const hasConfirmedStartRef = useRef(false);

    const completeStop = () => {
        stopActionLockRef.current = false;
        setIsStopping(false);
        setIsStarting(false);
        setIsRobotStarted(false);
        hasConfirmedStartRef.current = false;
        postStopGuardUntilRef.current = Date.now() + POST_STOP_TAP_GUARD_MS;
    };

    const failStop = () => {
        stopActionLockRef.current = false;
        setIsStopping(false);
    };

    const mapHostLogToStartupStatus = (line: string) => {
        const normalized = line.toLowerCase();

        if (normalized.includes('waiting for commands')) {
            return {
                type: 'success' as const,
                message: 'Robot started successfully.',
            };
        }

        if (
            normalized.includes('serial') ||
            normalized.includes('tty') ||
            normalized.includes('usb') ||
            normalized.includes('port not found')
        ) {
            return {
                type: 'error' as const,
                message: 'Arms not connected. Check USB/data cables and arm power.',
            };
        }

        if (
            normalized.includes('timed out') ||
            normalized.includes('connection refused') ||
            normalized.includes('network is unreachable') ||
            normalized.includes('failed to connect')
        ) {
            return {
                type: 'error' as const,
                message: 'Robot network unavailable. Confirm Wi-Fi/Ethernet and robot IP.',
            };
        }

        if (normalized.includes('permission denied') || normalized.includes('access denied')) {
            return {
                type: 'error' as const,
                message: 'Permission blocked. Restart app with required system permissions.',
            };
        }

        if (normalized.includes('calibration') && (normalized.includes('missing') || normalized.includes('invalid'))) {
            return {
                type: 'error' as const,
                message: 'Calibration missing or invalid. Re-run calibration before starting.',
            };
        }

        if (normalized.includes('traceback') || normalized.includes('exception') || normalized.includes('error')) {
            return {
                type: 'error' as const,
                message: 'Robot start failed with an internal error. Check robot service health.',
            };
        }

        return null;
    };

    useEffect(() => {
        const unlistenStartRobot = kioskEventManager.listenStartRobot((payload) => {
            if (payload.nickname !== nickname) return;

            suppressAutoStartingRef.current = false;
            setIsStarting(true);
            setIsStopping(false);
        });

        const unlistenStopRobot = kioskEventManager.listenStopRobot((payload) => {
            if (payload.nickname !== nickname) return;

            completeStop();
            toast.success('Robot stopped successfully', { ...toastSuccessDefaults });
        });

        const unlistenStopRobotError = kioskEventManager.listenStopRobotError((payload) => {
            if (payload.nickname !== nickname) return;

            failStop();
            toast.error(payload.error || 'Failed to stop robot.', { ...toastErrorDefaults });
        });

        return () => {
            unlistenStartRobot();
            unlistenStopRobot();
            unlistenStopRobotError();
        };
    }, [nickname, setIsRobotStarted]);

    useEffect(() => {
        const unlistenHostLog = kioskEventManager.listenHostLog((line) => {
            if (nickname && !line.includes(`[${nickname}]`)) return;

            const status = mapHostLogToStartupStatus(line);
            if (!status) return;

            if (lastToastMessageRef.current === status.message) {
                return;
            }
            lastToastMessageRef.current = status.message;

            if (status.type === 'success') {
                if (isStarting) {
                    hasConfirmedStartRef.current = true;
                    setIsRobotStarted(true);
                    setIsStarting(false);
                    setIsStopping(false);
                }
                toast.success(status.message, { ...toastSuccessDefaults });
            } else {
                if (isStarting) {
                    suppressAutoStartingRef.current = true;
                    setIsRobotStarted(false);
                    setIsStarting(false);
                }
                toast.error(status.message, { ...toastErrorDefaults });

                if (isStarting && !hasConfirmedStartRef.current && nickname) {
                    stopActionLockRef.current = true;
                    setIsStopping(true);

                    void invoke<string>('stop_kiosk_host', { nickname })
                        .catch((error) => {
                            console.error('Failed to auto-stop robot after start error:', error);
                        })
                        .finally(() => {
                            stopActionLockRef.current = false;
                            setIsStopping(false);
                        });
                }
            }
        });

        return () => {
            unlistenHostLog();
        };
    }, [nickname, setIsRobotStarted, isStarting]);

    useEffect(() => {
        let interval: any;

        const poll = async () => {
            try {
                const active = await invoke<boolean>('is_kiosk_host_active', { nickname });

                if (!active) {
                    suppressAutoStartingRef.current = false;
                    hasConfirmedStartRef.current = false;
                    if (isRobotStarted || isStarting) {
                        setIsStarting(false);
                        setIsRobotStarted(false);
                    }
                    if (isStopping) {
                        completeStop();
                    } else if (!stopActionLockRef.current) {
                        setIsStopping(false);
                    }
                    return;
                }

                if (!isRobotStarted && !isStopping && !suppressAutoStartingRef.current) {
                    setIsStarting(true);
                }
            } catch {
                // Do not clear stop lock during stop flow on transient polling errors.
                if (!stopActionLockRef.current) {
                    setIsStarting(false);
                    setIsStopping(false);
                    setIsRobotStarted(false);
                }
            }
        };

        poll();
        interval = setInterval(poll, 3000);

        return () => {
            interval && clearInterval(interval);
        };
    }, [nickname, isRobotStarted, isStopping, setIsRobotStarted]);

    const handleStartRobot = async () => {
        if (Date.now() < postStopGuardUntilRef.current) return;
        if (isStarting || isStopping || stopActionLockRef.current) return;

        setIsStarting(true);
        setIsStopping(false);
        setIsRobotStarted(false);
        suppressAutoStartingRef.current = false;
        hasConfirmedStartRef.current = false;
        lastToastMessageRef.current = 'Robot is starting...';
        toast.info('Robot is starting...', { ...toastInfoDefaults });

        try {
            await invoke<string>('start_kiosk_host', { nickname });
        } catch (error: any) {
            setIsRobotStarted(false);
            setIsStarting(false);

            console.error('Failed to start robot:', error);
            toast.error('Failed to start robot. Check connection and try again.', { ...toastErrorDefaults });
        }
    };

    const handleStopRobot = async () => {
        if (isStopping || isStarting || stopActionLockRef.current) return;

        stopActionLockRef.current = true;
        setIsStopping(true);
        setIsStarting(false);
        try {
            await invoke<string>('stop_kiosk_host', { nickname });
        } catch (error: any) {
            failStop();

            console.error('Failed to stop robot:', error);
            toast.error('Failed to stop robot.', { ...toastErrorDefaults });
        }
    };

    return {
        isRobotStarted,
        isStarting,
        isStopping,
        handleStartRobot,
        handleStopRobot,
    };
};
