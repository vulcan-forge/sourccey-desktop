import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useRobotStatus } from '@/context/robot-status-context';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { kioskEventManager } from '@/utils/logs/kiosk-logs/kiosk-events';

export const useKioskRobotStartStop = (nickname: string) => {
    const STOP_CONFIRM_TIMEOUT_MS = 20000;
    const POST_STOP_TAP_GUARD_MS = 800;
    const { isRobotStarted, setIsRobotStarted } = useRobotStatus();
    const [isStarting, setIsStarting] = useState(false);
    const [isStopping, setIsStopping] = useState(false);
    const [hostLogs, setHostLogs] = useState<string[]>([]);
    const stopActionLockRef = useRef(false);
    const postStopGuardUntilRef = useRef(0);

    useEffect(() => {
        const unlistenStartRobot = kioskEventManager.listenStartRobot((payload) => {
            if (payload.nickname !== nickname) return;

            setHostLogs((prev) => [...prev.slice(-99), `[system] ${payload.message ?? 'Host process started'} (pid: ${payload.pid ?? 'unknown'})`]);
            setIsStarting(false);
            setIsStopping(false);
            setIsRobotStarted(true);

            toast.success('Robot started successfully', { ...toastSuccessDefaults });
        });

        const unlistenStopRobot = kioskEventManager.listenStopRobot((payload) => {
            if (payload.nickname !== nickname) return;

            setHostLogs((prev) => [
                ...prev.slice(-99),
                `[system] Host process stopped${payload.exit_code !== null ? ` (exit ${payload.exit_code})` : ''}: ${payload.message}`,
            ]);
            // Keep stopping lock until polling confirms host is actually down.
            setIsStarting(false);

            toast.success('Robot stopped successfully', { ...toastSuccessDefaults });
        });

        const unlistenStopRobotError = kioskEventManager.listenStopRobotError((payload) => {
            if (payload.nickname !== nickname) return;

            setHostLogs((prev) => [...prev.slice(-99), `[system] Failed to stop host: ${payload.error}`]);
            stopActionLockRef.current = false;
            setIsStarting(false);
            setIsStopping(false);

            toast.error(payload.error || 'Failed to stop robot.', { ...toastErrorDefaults });
        });

        const unlistenHostLog = kioskEventManager.listenHostLog((line) => {
            setHostLogs((prev) => [...prev.slice(-99), line]);
        });

        return () => {
            unlistenStartRobot();
            unlistenStopRobot();
            unlistenStopRobotError();
            unlistenHostLog();
        };
    }, [nickname, setIsRobotStarted]);

    useEffect(() => {
        let cancelled = false;
        let interval: any;
        const lastActiveRef = { current: false };

        const poll = async () => {
            try {
                const active = await invoke<boolean>('is_kiosk_host_active', { nickname });

                if (!isRobotStarted && active && !lastActiveRef.current) {
                    lastActiveRef.current = true;
                    setIsStopping(false);
                    setIsStarting(true);

                    setTimeout(() => {
                        if (cancelled) return;
                        setIsRobotStarted(true);
                        setIsStarting(false);
                    }, 3000);

                    return;
                }

                if (isRobotStarted && !active && lastActiveRef.current) {
                    lastActiveRef.current = false;
                    setIsStarting(false);
                    setIsStopping(false);
                    setIsRobotStarted(false);
                    return;
                }
            } catch {
                lastActiveRef.current = false;
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
            cancelled = true;
            interval && clearInterval(interval);
        };
    }, [nickname, isRobotStarted, isStopping, setIsRobotStarted]);

    const handleStartRobot = async () => {
        if (Date.now() < postStopGuardUntilRef.current) return;
        if (isStarting || isStopping || stopActionLockRef.current) return;

        setIsStarting(true);
        setIsStopping(false);
        setIsRobotStarted(false);

        try {
            await invoke<string>('start_kiosk_host', { nickname });
        } catch (error: any) {
            setIsRobotStarted(false);
            setIsStarting(false);

            console.error('Failed to start robot:', error);
            toast.error('Failed to start robot. Check connection and try again.', { ...toastErrorDefaults });
        }
    };

    const waitForHostStopped = async () => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < STOP_CONFIRM_TIMEOUT_MS) {
            try {
                const active = await invoke<boolean>('is_kiosk_host_active', { nickname });
                if (!active) return;
            } catch {
                // Keep waiting on transient checker errors during shutdown.
            }
            await new Promise((resolve) => setTimeout(resolve, 400));
        }
        throw new Error('Timed out waiting for robot to stop.');
    };

    const handleStopRobot = async () => {
        if (isStopping || isStarting || stopActionLockRef.current) return;

        stopActionLockRef.current = true;
        setIsStopping(true);
        setIsStarting(false);
        try {
            await invoke<string>('stop_kiosk_host', { nickname });
            await waitForHostStopped();
            setIsRobotStarted(false);
            setIsStopping(false);
            stopActionLockRef.current = false;
            postStopGuardUntilRef.current = Date.now() + POST_STOP_TAP_GUARD_MS;
        } catch (error: any) {
            stopActionLockRef.current = false;
            setIsStopping(false);

            console.error('Failed to stop robot:', error);
            toast.error('Failed to stop robot.', { ...toastErrorDefaults });
        }
    };

    return {
        isRobotStarted,
        isStarting,
        isStopping,
        hostLogs,
        handleStartRobot,
        handleStopRobot,
    };
};
