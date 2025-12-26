'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FaPlay, FaStop, FaGamepad, FaTerminal, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { useRobotStatus } from '@/context/robot-status-context';
import { toast } from 'react-toastify';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { toastErrorDefaults, toastInfoDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { kioskEventManager } from '@/utils/logs/kiosk-logs/kiosk-events';

interface RobotControlProps {
    nickname: string;
}

export const RobotControl: React.FC<RobotControlProps> = ({ nickname }) => {
    const { isRobotStarted, setIsRobotStarted } = useRobotStatus();
    const [isStarting, setIsStarting] = useState(false);
    const [isStopping, setIsStopping] = useState(false);

    const [hostLogs, setHostLogs] = useState<string[]>([]);
    const [showLogs, setShowLogs] = useState(false);
    const hostLogEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!nickname) return;
    
        const unlistenStartRobot = kioskEventManager.listenStartRobot((payload) => {
          if (payload.nickname !== nickname) return;
    
          setHostLogs((prev) => [...prev, `[system] ${payload.message ?? 'Host process spawned'} (pid: ${payload.pid ?? 'unknown'})`]);
    
          setIsStarting(false);
          setIsStopping(false);
          setIsRobotStarted(true);

          toast.success('Robot started successfully', { ...toastSuccessDefaults });
        });
    
        const unlistenStopRobot = kioskEventManager.listenStopRobot((payload) => {
            if (payload.nickname !== nickname) return;
      
            setHostLogs((prev) => [
              ...prev,
              `[system] Host process shutdown${payload.exit_code !== null ? ` (exit ${payload.exit_code})` : ''}: ${payload.message}`,
            ]);
      
            setIsStarting(false);
            setIsStopping(false);
            setIsRobotStarted(false);

            toast.success('Robot stopped successfully', { ...toastSuccessDefaults });
          });
    
        const unlistenHostLog = kioskEventManager.listenHostLog((line) => {
          // Optional: if you only ever run one host at a time, this is fine.
          // If you run multiple hosts concurrently, you should include nickname in the log payload.
          setHostLogs((prev) => [...prev, line]);
    
          if (line.includes('Waiting for commands...')) {
            setIsRobotStarted(true);
            setIsStarting(false);
          }
        });
    
        return () => {
          unlistenStartRobot();
          unlistenStopRobot();
          unlistenHostLog();
        };
      }, [nickname, setIsRobotStarted]);
    

    // Poll kiosk host status when a robot is selected
    // useEffect(() => {
    //     let interval: any;
    //     const poll = async () => {
    //         if (!nickname) return;
    //         try {
    //             const active = await invoke<boolean>('is_kiosk_host_active', { nickname });
    //         } catch (e) {
    //             // If command not available or error, mark as inactive
    //         }
    //     };
    //     poll();
    //     interval = setInterval(poll, 3000);
    //     return () => interval && clearInterval(interval);
    // }, [nickname]);

    // Subscribe to kiosk host log events and process shutdown events
    // useEffect(() => {
    //     let isMounted = true;

    //     const setupListeners = async () => {
    //         try {
    //             const logUnlisten = await listen<string>('kiosk-host-log', (event: any) => {
    //                 if (!isMounted) return;
    //                 const line = typeof event.payload === 'string' ? event.payload : String(event.payload);
    //                 setHostLogs((prev: string[]) => [...prev, line]);

    //                 // Check if host is ready
    //                 if (line.includes('Waiting for commands...')) {
    //                     console.log('[Kiosk] Host is ready and waiting for commands');

    //                     setRobotStarted(true);
    //                     setIsLoading(false);
    //                     setIsHostReady(true);
    //                 }

    //                 // Check for errors that indicate startup failure (only if no error detected yet)
    //                 if (!hasDetectedErrorRef.current && robotStarted) {
    //                     const errorPatterns = [
    //                         'Failed to',
    //                         'Error:',
    //                         'Exception:',
    //                         'Traceback',
    //                         'cannot',
    //                         'Unable to',
    //                         'ConnectionRefusedError',
    //                         'PermissionError',
    //                         'FileNotFoundError',
    //                     ];

    //                     const hasError = errorPatterns.some((pattern) => line.toLowerCase().includes(pattern.toLowerCase()));

    //                     if (hasError) {
    //                         hasDetectedErrorRef.current = true;
    //                         console.error('[Kiosk] Error detected in host logs:', line);
    //                         toast.error('Host startup failed. Check logs for details.', {
    //                             ...toastErrorDefaults,
    //                             toastId: 'host-failed-to-start',
    //                         });
    //                         // Auto-stop the robot on error
    //                         setTimeout(async () => {
    //                             try {
    //                                 await invoke<string>('stop_kiosk_host', { nickname });
    //                                 setRobotStarted(false);
    //                                 setIsHostReady(false);
    //                                 setIsLoading(false);
    //                             } catch (e) {
    //                                 console.error('Failed to stop host after error:', e);
    //                             }
    //                         }, 500);
    //                     }
    //                 }
    //             });

    //             const shutdownUnlisten = await listen<any>('kiosk-host-process-shutdown', (event: any) => {
    //                 if (!isMounted) return;
    //                 setHostLogs((prev: string[]) => [
    //                     ...prev,
    //                     `\n[system] Host process shutdown${event?.payload?.exit_code !== undefined ? ` (exit ${event.payload.exit_code})` : ''}`,
    //                 ]);

    //                 // Reset host state when process shuts down unexpectedly
    //                 setRobotStarted(false);
    //                 setIsLoading(false);
    //                 setIsHostReady(false);
    //             });

    //             // Listen for external host process starting (process detected but not ready yet)
    //             const externalStartingUnlisten = await listen<void>('kiosk-host-external-starting', () => {
    //                 if (!isMounted) return;
    //                 setHostLogs((prev: string[]) => [...prev, '\n[system] External host process detected - waiting for initialization...']);

    //                 setIsLoading(true);
    //                 setIsHostReady(false);
    //                 toast.info('Robot host detected - starting up...', { ...toastInfoDefaults, toastId: 'host-starting' });
    //             });

    //             // Listen for external host process ready (port 5555 is open)
    //             const externalStartUnlisten = await listen<void>('kiosk-host-external-started', () => {
    //                 if (!isMounted) return;
    //                 setHostLogs((prev: string[]) => [...prev, '\n[system] External host is ready and listening for commands']);
    //                 setRobotStarted(true);
    //                 setIsHostReady(true);
    //                 setIsLoading(false);
    //                 toast.dismiss('host-starting');
    //                 toast.success('✅ Robot host is ready!', { ...toastSuccessDefaults });
    //             });

    //             // Listen for external host process stopping
    //             const externalStopUnlisten = await listen<void>('kiosk-host-external-stopped', () => {
    //                 if (!isMounted) return;
    //                 setHostLogs((prev: string[]) => [...prev, '\n[system] External host process stopped']);
    //                 // Dismiss the "starting" toast if it's still showing
    //                 toast.dismiss('host-starting');
    //                 // Show an error toast if the host stopped during startup
    //                 if (isLoading) {
    //                     toast.error('Robot host failed to start', { ...toastErrorDefaults, toastId: 'host-failed-to-start' });
    //                 }
    //                 setRobotStarted(false);
    //                 setIsHostReady(false);
    //                 setIsLoading(false);
    //             });

    //             // Store cleanup functions only if component is still mounted
    //             if (isMounted) {
    //                 unlistenFnsRef.current = [
    //                     logUnlisten,
    //                     shutdownUnlisten,
    //                     externalStartingUnlisten,
    //                     externalStartUnlisten,
    //                     externalStopUnlisten,
    //                 ];
    //             }
    //         } catch (err) {
    //             console.error('Failed to setup kiosk event listeners:', err);
    //         }
    //     };

    //     setupListeners();

    //     return () => {
    //         isMounted = false;

    //         // Clean up listeners
    //         const cleanupFns = unlistenFnsRef.current;
    //         unlistenFnsRef.current = [];

    //         // Use queueMicrotask to ensure cleanup happens after current call stack
    //         queueMicrotask(() => {
    //             cleanupFns.forEach((fn) => {
    //                 // Extra defensive checks to prevent any errors from bubbling up
    //                 if (fn && typeof fn === 'function') {
    //                     try {
    //                         // Wrap in Promise.resolve to catch any synchronous or asynchronous errors
    //                         Promise.resolve(fn()).catch(() => {
    //                             // Silently ignore - listener already cleaned up
    //                         });
    //                     } catch {
    //                         // Silently ignore - listener may have been cleaned up by Tauri already
    //                     }
    //                 }
    //             });
    //         });
    //     };
    // }, [nickname, robotStarted, isLoading, setIsHostReady, setRobotStarted]);

    // Auto-scroll host logs terminal
    useEffect(() => {
        hostLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [hostLogs]);

    // Test message on mount
    useEffect(() => {
        setHostLogs((prev: string[]) => [...prev, '=== COMPONENT MOUNTED ===']);
    }, []);

    const handleStartRobot = async () => {
        if (isStarting || isStopping) return;

        setIsStarting(true);
        setIsRobotStarted(false);

        try {
            await invoke<string>('start_kiosk_host', { nickname });
            toast.info('Robot starting...', { ...toastInfoDefaults });
        } catch (error: any) {
            setIsRobotStarted(false);
            setIsStarting(false);

            console.error('Failed to start robot:', error);
            toast.error('Failed to start robot. Check connection and try again.', { ...toastErrorDefaults });
        }
    };

    const handleStopRobot = async () => {
        if (isStopping || isStarting) return;

        setIsStopping(true);
        try {
            // Stop the robot
            await invoke<string>('stop_kiosk_host', { nickname });
            toast.info('Robot stopping...', { ...toastInfoDefaults });
            setIsRobotStarted(false);

            // Clear the terminal logs when stopping
            setHostLogs([]);
        } catch (error: any) {
            setIsStopping(false);

            console.error('Failed to stop robot:', error);
            toast.error('Failed to stop robot.', { ...toastErrorDefaults });
        }
    };

    return (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            {/* Control Header */}
            <div className="flex items-center justify-start gap-4">
                <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
                    <FaGamepad className="h-5 w-5 text-slate-400" />
                    Robot Control
                </h2>
                <div className="grow"></div>

                {/* Start/Stop Robot Button */}
                <button
                    onClick={isRobotStarted ? handleStopRobot : handleStartRobot}
                    disabled={isStarting}
                    className={`inline-flex w-36 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
                        isStarting
                            ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                            : isRobotStarted
                              ? 'cursor-pointer bg-red-500 text-white hover:bg-red-600'
                              : 'cursor-pointer bg-green-600 text-white hover:bg-green-700'
                    }`}
                >
                    {isStarting ? (
                        <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            {isRobotStarted ? 'Stopping...' : 'Starting...'}
                        </>
                    ) : isRobotStarted ? (
                        <>
                            <FaStop className="h-4 w-4" /> Stop Robot
                        </>
                    ) : (
                        <>
                            <FaPlay className="h-4 w-4" /> Start Robot
                        </>
                    )}
                </button>
            </div>

            {/* Logs Section */}
            <div className="mt-2">
                <div className="overflow-hidden rounded-lg border border-slate-600 bg-slate-900/50">
                    <div className="flex items-center justify-between bg-slate-800 p-3">
                        <div className="flex items-center gap-3">
                            <FaTerminal className="h-4 w-4 text-slate-400" />
                            <h3 className="text-sm font-semibold text-white">Logs</h3>
                            {isRobotStarted && (
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                                    <span className="text-xs text-slate-400">Live</span>
                                </div>
                            )}
                            {!isRobotStarted && (
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-red-400" />
                                    <span className="text-xs text-slate-400">{isStarting ? 'Starting...' : 'Inactive'}</span>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => setShowLogs(!showLogs)}
                            className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-slate-700/60"
                        >
                            {showLogs ? (
                                <>
                                    <FaChevronUp className="h-3 w-3" />
                                    Hide
                                </>
                            ) : (
                                <>
                                    <FaChevronDown className="h-3 w-3" />
                                    Show
                                </>
                            )}
                        </button>
                    </div>

                    {showLogs && (
                        <>
                            <div className="scrollbar scrollbar-thumb-slate-600 scrollbar-track-slate-800 h-[420px] overflow-y-auto bg-slate-900/50 font-mono">
                                <div className="space-y-0.5 p-4">
                                    {hostLogs.length > 0 ? (
                                        hostLogs.slice(-50).map((log, index) => (
                                            <div key={index} className="text-xs leading-relaxed text-slate-400">
                                                {log}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-sm text-slate-400">
                                            {isStarting
                                                ? 'Waiting for host to start...'
                                                : isRobotStarted
                                                  ? 'Waiting for robot output...'
                                                  : 'Robot has not started yet'}
                                        </div>
                                    )}
                                    <div ref={hostLogEndRef} />
                                </div>
                            </div>

                            <div className="border-t border-slate-600 bg-slate-800 p-3">
                                <div className="flex items-center justify-between font-mono text-xs text-slate-400">
                                    <span>ENTRIES: {hostLogs.length}</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
