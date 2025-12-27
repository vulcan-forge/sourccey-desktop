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
              `[system] Host process stopped${payload.exit_code !== null ? ` (exit ${payload.exit_code})` : ''}: ${payload.message}`,
            ]);
      
            setIsStarting(false);
            setIsStopping(false);
            setIsRobotStarted(false);

            toast.success('Robot stopped successfully', { ...toastSuccessDefaults });
          });

        const unlistenStopRobotError = kioskEventManager.listenStopRobotError((payload) => {
            if (payload.nickname !== nickname) return;

            setHostLogs((prev) => [...prev, `[system] Failed to stop host: ${payload.error}`]);
            
            setIsStarting(false);
            setIsStopping(false);

            toast.error(payload.error || 'Failed to stop robot.', { ...toastErrorDefaults });
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
          unlistenStopRobotError();
          unlistenHostLog();
        };
      }, [nickname, setIsRobotStarted]);
    

    // Poll kiosk host status when a robot is selected
    useEffect(() => {
        if (!nickname) return;

        let cancelled = false;
        let interval: any;
        const lastActiveRef = { current: false };
        
        const poll = async () => {
            try {
                const active = await invoke<boolean>('is_kiosk_host_active', { nickname });
          
                // Transition: false -> true (detected host running)
                if (!isRobotStarted && active && !lastActiveRef.current) {
                  lastActiveRef.current = true;
          
                  setIsStopping(false);
                  setIsStarting(true);
          
                  // debounce to allow host to become usable
                  // This is to give some time for the robot
                  // to start and say "Waiting for commands..."
                  // This should be replaced in the future with exact tracking
                  // on the internals of the process
                  setTimeout(() => {
                    if (cancelled) return;
                    setIsRobotStarted(true);
                    setIsStarting(false);
                  }, 3000);
          
                  return;
                }
          
                // Transition: true -> false (host no longer running)
                if (isRobotStarted && !active && lastActiveRef.current) {
                  lastActiveRef.current = false;
          
                  setIsStarting(false);
                  setIsStopping(false);
                  setIsRobotStarted(false);
                  return;
                }
          
                // No transition: keep state as-is
              } catch (e) {
                // If the poll fails, treat as inactive (optional)
                lastActiveRef.current = false;
                setIsStarting(false);
                setIsStopping(false);
                setIsRobotStarted(false);
              }
        };
        poll();

        interval = setInterval(poll, 3000);
        return () => {
            cancelled = true;
            interval && clearInterval(interval);
        };

    }, [nickname]);

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

    const handleStopRobot = async () => {
        if (isStopping || isStarting) return;

        setIsStopping(true);
        setIsStarting(false);
        try {
            // Stop the robot
            await invoke<string>('stop_kiosk_host', { nickname });
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
                    disabled={isStarting || isStopping}
                    className={`inline-flex w-36 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
                        isStarting || isStopping
                            ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                            : isRobotStarted
                              ? 'cursor-pointer bg-red-500 text-white hover:bg-red-600 active:bg-red-700'
                              : 'cursor-pointer bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
                    }`}
                >
                    {isStarting || isStopping ? (
                        <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            {isStarting && 'Starting...'}
                            {isStopping && 'Stopping...'}
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
