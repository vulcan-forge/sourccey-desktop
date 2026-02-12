'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FaBatteryHalf, FaBatteryFull, FaBatteryQuarter, FaBatteryEmpty, FaThermometerHalf, FaNetworkWired, FaBatteryThreeQuarters, FaPlay, FaStop } from 'react-icons/fa';
import { setSystemInfo, useGetSystemInfo, type BatteryData } from '@/hooks/System/system-info.hook';
import { useRobotStatus } from '@/context/robot-status-context';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { kioskEventManager } from '@/utils/logs/kiosk-logs/kiosk-events';

export const HomeWelcome = () => {
    const nickname = 'sourccey';
    const robotType = 'Sourccey';
    const { isRobotStarted, setIsRobotStarted } = useRobotStatus();
    const [isStarting, setIsStarting] = useState(false);
    const [isStopping, setIsStopping] = useState(false);
    const [hostLogs, setHostLogs] = useState<string[]>([]);
    const [pairingCode, setPairingCode] = useState('------');
    const [pairingExpiresAt, setPairingExpiresAt] = useState<number | null>(null);

    // State for system info (battery, temperature, IP)
    const { data: systemInfo }: any = useGetSystemInfo();

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
            setIsStarting(false);
            setIsStopping(false);
            setIsRobotStarted(false);

            toast.success('Robot stopped successfully', { ...toastSuccessDefaults });
        });

        const unlistenStopRobotError = kioskEventManager.listenStopRobotError((payload) => {
            if (payload.nickname !== nickname) return;

            setHostLogs((prev) => [...prev.slice(-99), `[system] Failed to stop host: ${payload.error}`]);
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
    }, [nickname, isRobotStarted, setIsRobotStarted]);

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
            await invoke<string>('stop_kiosk_host', { nickname });
            setIsRobotStarted(false);
        } catch (error: any) {
            setIsStopping(false);

            console.error('Failed to stop robot:', error);
            toast.error('Failed to stop robot.', { ...toastErrorDefaults });
        }
    };

    // Fetch system info periodically
    useEffect(() => {
        const fetchSystemInfo = async () => {
            try {
                const info = await invoke<{ ip_address: string; temperature: string; battery_data: BatteryData }>('get_system_info');
                const systemInfo = {
                    ipAddress: info.ip_address,
                    temperature: info.temperature,
                    batteryData: info.battery_data,
                };
                setSystemInfo(systemInfo);
            } catch (error) {
                console.error('Failed to get system info:', error);
            }
        };

        fetchSystemInfo();
        const interval = setInterval(fetchSystemInfo, 60000); // Update every 60 seconds
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const fetchPairingInfo = async () => {
            try {
                const info = await invoke<{
                    code: string;
                    expires_at_ms: number;
                    service_port: number;
                    robot_name: string;
                    nickname: string;
                    robot_type: string;
                }>('get_kiosk_pairing_info');
                setPairingCode(info.code || '------');
                setPairingExpiresAt(info.expires_at_ms || null);
            } catch {
                setPairingCode('------');
                setPairingExpiresAt(null);
            }
        };

        fetchPairingInfo();
        const interval = setInterval(fetchPairingInfo, 30000);
        return () => clearInterval(interval);
    }, []);

    // Get battery icon based on percentage
    const getBatteryIcon = (percent: number) => {
        if (percent >= 75) return FaBatteryFull;
        if (percent >= 50) return FaBatteryThreeQuarters;
        if (percent >= 25) return FaBatteryHalf;
        if (percent >= 5) return FaBatteryQuarter;
        return FaBatteryEmpty;
    };

    const getBatteryColor = (percent: number) => {
        if (percent > 75) return 'text-green-400';
        if (percent > 25) return 'text-slate-300';
        if (percent > 10) return 'text-yellow-400';
        return 'text-red-400';
    };

    const BatteryIcon = getBatteryIcon(systemInfo.batteryData.percent);
    const BatteryColor = getBatteryColor(systemInfo.batteryData.percent);
    const batteryPercent = systemInfo.batteryData.percent >= 0 ? systemInfo.batteryData.percent : 0;
    const batteryPercentString = batteryPercent >= 0 ? `${batteryPercent}%` : 'Off';
    
    return (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-white">Welcome back!</h2>
                    <p className="mt-2 text-slate-300">Here&apos;s what&apos;s happening with {nickname} today.</p>
                </div>
                <div className="text-right">
                    <div className="text-sm text-slate-400">Robot Type</div>
                    <div className="text-xl font-bold text-white">{robotType}</div>
                </div>
            </div>

            {/* Battery Life Card */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                                <BatteryIcon className={`h-4 w-4 ${BatteryColor}`} />
                                Battery Life
                            </div>
                            <div className={`mt-2 text-3xl font-bold ${BatteryColor}`}>
                                {batteryPercentString}
                            </div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                            {batteryPercent >= 0 && (
                                <>{batteryPercent > 50 ? 'Good' : batteryPercent > 20 ? 'Low' : 'Critical'}</>
                            )}
                        </div>
                    </div>
                </div>

                {/* System Temperature */}
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                                <FaThermometerHalf className="h-4 w-4 text-orange-400" />
                                Temperature
                            </div>
                            <div className="mt-2 text-3xl font-bold text-white">
                                {systemInfo.temperature !== '...' ? systemInfo.temperature : 'N/A'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Network Info */}
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                                <FaNetworkWired className="h-4 w-4 text-blue-400" />
                                IP Address
                            </div>
                            <div className="mt-2 font-mono text-lg font-bold text-white">
                                {systemInfo.ipAddress && systemInfo.ipAddress.trim() !== '' && systemInfo.ipAddress.toLowerCase() !== 'unknown' && systemInfo.ipAddress !== '...'
                                    ? systemInfo.ipAddress
                                    : 'Disconnected'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div className="text-sm text-slate-400">Pairing Code (Desktop App)</div>
                <div className="mt-2 font-mono text-4xl font-bold tracking-wider text-white">{pairingCode}</div>
                <div className="mt-1 text-xs text-slate-400">
                    {pairingExpiresAt ? `Expires: ${new Date(pairingExpiresAt).toLocaleTimeString()}` : 'Pairing code unavailable'}
                </div>
            </div>

            <div className="mt-2">
                <button
                    onClick={isRobotStarted ? handleStopRobot : handleStartRobot}
                    disabled={isStarting || isStopping}
                    className={`inline-flex min-h-20 w-full items-center justify-center gap-3 rounded-xl px-12 py-5 text-xl font-semibold transition-all ${
                        isStarting || isStopping
                            ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                            : isRobotStarted
                              ? 'cursor-pointer bg-red-500 text-white hover:bg-red-600 active:bg-red-700'
                              : 'cursor-pointer bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
                    }`}
                >
                    {isStarting || isStopping ? (
                        <>
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            {isStarting && 'Starting...'}
                            {isStopping && 'Stopping...'}
                        </>
                    ) : isRobotStarted ? (
                        <>
                            <FaStop className="h-5 w-5" /> Stop Robot
                        </>
                    ) : (
                        <>
                            <FaPlay className="h-5 w-5" /> Start Robot
                        </>
                    )}
                </button>
            </div>

            <div className="mt-2 overflow-hidden rounded-lg border border-slate-600 bg-slate-900/50">
                <div className="border-b border-slate-700 bg-slate-800 p-3">
                    <h3 className="text-sm font-semibold text-white">Robot Logs</h3>
                </div>
                <div className="h-56 overflow-y-auto bg-slate-900/40 p-3 font-mono">
                    {hostLogs.length > 0 ? (
                        hostLogs.map((log, idx) => (
                            <div key={idx} className="text-xs leading-relaxed text-slate-300">
                                {log}
                            </div>
                        ))
                    ) : (
                        <div className="text-sm text-slate-400">No logs yet. Start the robot to see host output.</div>
                    )}
                </div>
            </div>
        </div>
    );
};
