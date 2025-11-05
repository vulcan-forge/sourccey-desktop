import { useState, useEffect, useCallback, useRef } from 'react';
import { FaCog, FaRobot, FaSpinner, FaPlay, FaStop, FaWifi, FaEye, FaEyeSlash } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { setConfig, useGetConfig } from '@/hooks/Control/config.hook';
import { SshControl, sshStartRobot, sshStopRobot } from '@/utils/logs/ssh-logs/ssh-control';
import {
    sshLogManager,
    type SshConnectionSuccess,
    type SshConnectionError,
    type SshRobotStartSuccess,
    type SshRobotStartError,
    type SshRobotStopError,
    type SshRobotStopSuccess,
    type SshConnectionStatusSuccess,
    type SshConnectionStatusError,
    type SshRobotStartedSuccess,
    type SshRobotStartedError,
} from '@/utils/logs/ssh-logs/ssh-events';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import type { ConfigConfig } from '@/components/PageComponents/OwnedRobots/RobotConfig';
import {
    getRemoteRobotState,
    RemoteControlType,
    RemoteRobotStatus,
    setRemoteRobotState,
    useGetRemoteRobotState,
} from '@/hooks/Control/remote-control.hook';
import { Spinner } from '@/components/Elements/Spinner';
import { setRemoteConfig, useGetRemoteConfig } from '@/hooks/Control/remote-config.hook';
import { isConnected, isConnecting, isDisconnecting, isStarted, isStarting, isStopping } from '@/utils/robot/robot-status';

export const RemoteRobotConfig = ({ ownedRobot, onClose }: { ownedRobot: any; onClose: () => void }) => {
    const nickname = ownedRobot?.nickname ?? '';
    const [showConfig, setShowConfig] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const { data: remoteConfig, isLoading: isLoadingConfig }: any = useGetRemoteConfig(nickname as string);
    const { data: remoteRobotState }: any = useGetRemoteRobotState(nickname as string);
    const [isLoadingConnectionState, setIsLoadingConnectionState] = useState(true);

    const robotStatus = remoteRobotState?.status;
    const controlType = remoteRobotState?.controlType;
    const isRobotConnected = isConnected(robotStatus);
    const isRobotConnecting = isConnecting(robotStatus);
    const isRobotDisconnecting = isDisconnecting(robotStatus);
    const isRobotStarted = isStarted(robotStatus);
    const isRobotStarting = isStarting(robotStatus);
    const isRobotStopping = isStopping(robotStatus);

    // Add refs to track interval IDs
    const connectionIntervalIdRef = useRef<NodeJS.Timeout | null>(null);
    const startedIntervalIdRef = useRef<NodeJS.Timeout | null>(null);

    //---------------------------------------------------

    // Loading state
    const [isLoadingAutoCalibrate, setIsLoadingAutoCalibrate] = useState(false);
    const [detectedConfig, setDetectedConfig] = useState<any>(null);
    const [isLoadingDetectConfig, setIsLoadingDetectConfig] = useState(false);

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const configData = await invoke<RemoteConfig>('read_remote_config', { nickname });
                setRemoteConfig(nickname, configData);
            } catch (error) {
                console.error('Failed to load config:', error);
            }
        };
        loadConfig();
    }, [nickname]);

    //---------------------------------------------------
    // Event handlers for SSH events
    //---------------------------------------------------
    const handleConnectionSuccess = useCallback(
        (event: SshConnectionSuccess) => {
            if (event.nickname === nickname) {
                console.log(`✅ Robot ${nickname} connected successfully: ${event.message}`);
                setRemoteRobotState(nickname, RemoteRobotStatus.CONNECTED, null, ownedRobot);
                setErrorMessage('');
                toast.success(event.message, {
                    ...toastSuccessDefaults,
                });
            }
        },
        [nickname, ownedRobot]
    );

    const handleConnectionError = useCallback(
        (event: SshConnectionError) => {
            if (event.nickname === nickname) {
                console.error(`❌ Robot ${nickname} connection failed: ${event.error}`);
                setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
                setErrorMessage(event.error);
                toast.error(`Robot ${nickname} connection failed`, {
                    ...toastErrorDefaults,
                });
            }
        },
        [nickname]
    );

    const handleConnectionStatusSuccess = useCallback(
        (event: SshConnectionStatusSuccess) => {
            if (event.nickname === nickname) {
                console.log(`🔄 Robot ${nickname} is connected: ${event.message}`);
                setIsLoadingConnectionState(false);

                const remoteRobotState = getRemoteRobotState(nickname);
                const currentStatus = remoteRobotState.status;
                const newStatus = currentStatus === RemoteRobotStatus.STARTING ? RemoteRobotStatus.STARTED : RemoteRobotStatus.CONNECTED;

                setRemoteRobotState(nickname, newStatus, null, ownedRobot);
                setErrorMessage('');
            }
        },
        [nickname, ownedRobot]
    );

    const handleConnectionStatusError = useCallback(
        (event: SshConnectionStatusError) => {
            if (event.nickname === nickname) {
                console.error(`❌ Robot ${nickname} is not connected: ${event.error}`);
                setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
                setIsLoadingConnectionState(false);
                setErrorMessage(event.error);
            }
        },
        [nickname]
    );

    const handleRobotStartSuccess = useCallback(
        (event: SshRobotStartSuccess) => {
            if (event.nickname === nickname) {
                console.log(`✅ Robot ${nickname} started successfully: ${event.message}`);
                setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, null, ownedRobot);
                toast.success(event.message, {
                    ...toastSuccessDefaults,
                });
            }
        },
        [nickname, ownedRobot]
    );

    const handleRobotStartError = useCallback(
        (event: SshRobotStartError) => {
            if (event.nickname === nickname) {
                console.error(`❌ Robot ${nickname} start failed: ${event.error}`);
                setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
                toast.error(event.error, {
                    ...toastErrorDefaults,
                });
            }
        },
        [nickname, ownedRobot]
    );

    const handleRobotStopSuccess = useCallback(
        (event: SshRobotStopSuccess) => {
            if (event.nickname === nickname) {
                console.log(`✅ Robot ${nickname} stopped successfully: ${event.message}`);
                setRemoteRobotState(nickname, RemoteRobotStatus.CONNECTED, RemoteControlType.NONE, ownedRobot);
                toast.success(event.message, {
                    ...toastSuccessDefaults,
                });
            }
        },
        [nickname, ownedRobot]
    );

    const handleRobotStopError = useCallback(
        (event: SshRobotStopError) => {
            if (event.nickname === nickname) {
                console.error(`❌ Robot ${nickname} stop failed: ${event.error}`);
                setRemoteRobotState(nickname, RemoteRobotStatus.CONNECTED, RemoteControlType.NONE, ownedRobot);
                toast.error(event.error, {
                    ...toastErrorDefaults,
                });
            }
        },
        [nickname, ownedRobot]
    );

    const handleRobotStartedSuccess = useCallback(
        (event: SshRobotStartedSuccess) => {
            if (event.nickname === nickname) {
                console.log(`✅ Robot ${nickname} is running: ${event.message}`);
                console.log('event', event);
                if (event.output === 'started') {
                    setRemoteRobotState(nickname, RemoteRobotStatus.STARTED, null, ownedRobot);
                } else {
                    setRemoteRobotState(nickname, RemoteRobotStatus.NONE, RemoteControlType.NONE, ownedRobot);
                }
            }
        },
        [nickname, ownedRobot]
    );

    const handleRobotStartedError = useCallback(
        (event: SshRobotStartedError) => {
            if (event.nickname === nickname) {
                console.info(`Robot ${nickname} is not running`);
                setRemoteRobotState(nickname, RemoteRobotStatus.CONNECTED, null, ownedRobot);
            }
        },
        [nickname]
    );

    //---------------------------------------------------

    // Check connection status
    useEffect(() => {
        // Don't run if remoteConfig hasn't loaded yet
        if (!remoteConfig || isLoadingConfig) {
            return;
        }

        const checkConnection = async () => {
            try {
                // Guard: Don't check if remoteConfig hasn't loaded yet
                if (!remoteConfig) {
                    return;
                }
                console.info('Checking connection status');
                await SshControl.isConnected(remoteConfig, nickname);
            } catch (error) {
                console.error('Failed to check connection status:', error);
                setIsLoadingConnectionState(false);
                setRemoteRobotState(nickname, RemoteRobotStatus.NONE, null, ownedRobot);
            }
        };

        let connectionIntervalId: NodeJS.Timeout;
        const checkConnectionInterval = async () => {
            try {
                setIsLoadingConnectionState(false);
                if (connectionIntervalIdRef.current) {
                    clearInterval(connectionIntervalIdRef.current);
                }

                // Store in ref so cleanup can access it
                connectionIntervalIdRef.current = setInterval(checkConnection, 3 * 60 * 1000);
            } catch (error) {
                console.error('Failed to check initial connection status:', error);
                setIsLoadingConnectionState(false);
                setRemoteRobotState(nickname, RemoteRobotStatus.NONE, null, ownedRobot);
            }
        };

        checkConnectionInterval();

        // Cleanup interval on unmount
        return () => {
            if (connectionIntervalIdRef.current) {
                clearInterval(connectionIntervalIdRef.current);
                connectionIntervalIdRef.current = null;
            }
        };
    }, [remoteConfig, nickname, isLoadingConfig]); // Add dependencies

    useEffect(() => {
        // Don't run if remoteConfig hasn't loaded yet
        if (!remoteConfig || isLoadingConfig || !isConnected(robotStatus)) {
            return;
        }

        let startedIntervalId: NodeJS.Timeout;
        const checkRobotStarted = async () => {
            try {
                // Guard: Don't check if remoteConfig hasn't loaded yet
                if (!remoteConfig) {
                    return;
                }
                await SshControl.isRobotStarted(remoteConfig, nickname);
            } catch (error) {
                console.error('Failed to check robot started status:', error);
                setRemoteRobotState(nickname, RemoteRobotStatus.NONE, null, ownedRobot);
            }
        };

        const checkRobotStartedInterval = async () => {
            try {
                // Clear any existing interval first
                if (startedIntervalIdRef.current) {
                    clearInterval(startedIntervalIdRef.current);
                }

                // Store in ref so cleanup can access it
                startedIntervalIdRef.current = setInterval(checkRobotStarted, 30 * 1000);
            } catch (error) {
                console.error('Failed to check initial robot started status:', error);
                setRemoteRobotState(nickname, RemoteRobotStatus.CONNECTED, null, ownedRobot);
            }
        };

        checkRobotStartedInterval();

        // Cleanup interval on unmount
        return () => {
            if (startedIntervalIdRef.current) {
                clearInterval(startedIntervalIdRef.current);
                startedIntervalIdRef.current = null;
            }
        };
    }, [remoteConfig, nickname, isLoadingConfig, robotStatus]); // Add dependencies);

    // Set up event listeners for this specific robot
    useEffect(() => {
        // Override the event manager's handlers for this component
        const originalSuccessHandler = sshLogManager['onConnectionSuccess'];
        const originalErrorHandler = sshLogManager['onConnectionError'];
        const originalConnectionStatusSuccessHandler = sshLogManager['onConnectionStatusSuccess'];
        const originalConnectionStatusErrorHandler = sshLogManager['onConnectionStatusError'];
        const originalStartSuccessHandler = sshLogManager['onRobotStartSuccess'];
        const originalStartErrorHandler = sshLogManager['onRobotStartError'];
        const originalStopSuccessHandler = sshLogManager['onRobotStopSuccess'];
        const originalStopErrorHandler = sshLogManager['onRobotStopError'];
        const originalStartedSuccessHandler = sshLogManager['onRobotStartedSuccess'];
        const originalStartedErrorHandler = sshLogManager['onRobotStartedError'];

        // Set up component-specific handlers
        sshLogManager['onConnectionSuccess'] = handleConnectionSuccess;
        sshLogManager['onConnectionError'] = handleConnectionError;
        sshLogManager['onConnectionStatusSuccess'] = handleConnectionStatusSuccess;
        sshLogManager['onConnectionStatusError'] = handleConnectionStatusError;
        sshLogManager['onRobotStartSuccess'] = handleRobotStartSuccess;
        sshLogManager['onRobotStartError'] = handleRobotStartError;
        sshLogManager['onRobotStopSuccess'] = handleRobotStopSuccess;
        sshLogManager['onRobotStopError'] = handleRobotStopError;
        sshLogManager['onRobotStartedSuccess'] = handleRobotStartedSuccess;
        sshLogManager['onRobotStartedError'] = handleRobotStartedError;

        // Cleanup: restore original handlers
        return () => {
            sshLogManager['onConnectionSuccess'] = originalSuccessHandler;
            sshLogManager['onConnectionError'] = originalErrorHandler;
            sshLogManager['onConnectionStatusSuccess'] = originalConnectionStatusSuccessHandler;
            sshLogManager['onConnectionStatusError'] = originalConnectionStatusErrorHandler;
            sshLogManager['onRobotStartSuccess'] = originalStartSuccessHandler;
            sshLogManager['onRobotStartError'] = originalStartErrorHandler;
            sshLogManager['onRobotStopSuccess'] = originalStopSuccessHandler;
            sshLogManager['onRobotStopError'] = originalStopErrorHandler;
            sshLogManager['onRobotStartedSuccess'] = originalStartedSuccessHandler;
            sshLogManager['onRobotStartedError'] = originalStartedErrorHandler;
        };
    }, [
        handleConnectionSuccess,
        handleConnectionError,
        handleConnectionStatusSuccess,
        handleConnectionStatusError,
        handleRobotStartSuccess,
        handleRobotStartError,
        handleRobotStopSuccess,
        handleRobotStopError,
        handleRobotStartedSuccess,
        handleRobotStartedError,
    ]);

    const saveRemoteConfig = async (newConfig: any) => {
        try {
            await invoke('write_remote_config', { config: newConfig, nickname });
        } catch (error) {
            console.error('Failed to save config:', error);
        }
    };

    const handleIpAddressChange = async (value: string) => {
        const newConfig: any = JSON.parse(JSON.stringify(remoteConfig));
        newConfig.remote_ip = value;
        setRemoteConfig(nickname, newConfig);
        await saveRemoteConfig(newConfig);
    };

    const handleUsernameChange = async (value: string) => {
        const newConfig: any = JSON.parse(JSON.stringify(remoteConfig));
        newConfig.username = value;
        setRemoteConfig(nickname, newConfig);
        await saveRemoteConfig(newConfig);
    };

    const handlePasswordChange = async (value: string) => {
        const newConfig: any = JSON.parse(JSON.stringify(remoteConfig));
        newConfig.password = value;
        setRemoteConfig(nickname, newConfig);
        await saveRemoteConfig(newConfig);
    };

    const handleLeftArmPortChange = async (value: string) => {
        const newConfig: any = JSON.parse(JSON.stringify(remoteConfig));
        newConfig.left_arm_port = value;
        setRemoteConfig(nickname, newConfig);
        await saveRemoteConfig(newConfig);
    };

    const handleRightArmPortChange = async (value: string) => {
        const newConfig: any = JSON.parse(JSON.stringify(remoteConfig));
        newConfig.right_arm_port = value;
        setRemoteConfig(nickname, newConfig);
        await saveRemoteConfig(newConfig);
    };

    const autoCalibrate = async () => {
        console.log('autoCalibrate');
        // setIsLoadingAutoCalibrate(true);

        // try {
        //     const followerArmKey = Object.keys(config?.follower_arms)[0] as string;
        //     const leaderArmKey = Object.keys(config?.leader_arms)[0] as string;
        //     const calibrationConfig: CalibrationConfig = {
        //         nickname: nickname,
        //         robot_type: 'so100_follower',
        //         teleop_type: 'so100_leader',
        //         robot_port: config?.follower_arms?.[followerArmKey]?.port,
        //         teleop_port: config?.leader_arms?.[leaderArmKey]?.port,
        //     };
        //     const result: any = await invoke('auto_calibrate', { config: calibrationConfig });
        //     toast.success('Auto calibration successful!', {
        //         ...toastSuccessDefaults,
        //     });
        // } catch (error) {
        //     console.error('Failed to auto calibrate:', error);
        //     toast.error('Failed to auto calibrate, please turn on your robots and / or power supplies and try again', {
        //         ...toastErrorDefaults,
        //     });
        // } finally {
        //     setIsLoadingAutoCalibrate(false);
        // }
    };

    const autoDetectConfig = async () => {
        setIsLoadingDetectConfig(true);

        try {
            const config: ConfigConfig = {
                nickname: nickname,
                robot_type: 'so100_follower',
            };

            // The result is in this format {"ports": [], "cameras": []}
            const result: any = await invoke('detect_config', { config });
            const ports = result.ports;
            const cameras = result.cameras;

            setDetectedConfig({ ports, cameras });
            toast.success('Config detected successfully!', {
                ...toastSuccessDefaults,
            });
        } catch (error) {
            console.error('Failed to detect config:', error);
            toast.error('Failed to detect config, please turn on your robots and / or power supplies and try again', {
                ...toastErrorDefaults,
            });
        } finally {
            setIsLoadingDetectConfig(false);
        }
    };

    const toggleConnection = async () => {
        if (robotStatus == RemoteRobotStatus.CONNECTED) {
            await disconnect();
        } else {
            await connect();
        }
    };

    const connect = async () => {
        try {
            setRemoteRobotState(nickname, RemoteRobotStatus.CONNECTING, null, ownedRobot);
            setErrorMessage('');
            await SshControl.connect(remoteConfig, nickname);
        } catch (error) {
            console.error('Failed to connect:', error);
            setRemoteRobotState(nickname, RemoteRobotStatus.NONE, null, ownedRobot);
            setErrorMessage(error instanceof Error ? error.message : 'Connection failed, please checked your Robot IP, Username, and Password');
        }
    };

    const disconnect = async () => {
        try {
            setRemoteRobotState(nickname, RemoteRobotStatus.DISCONNECTING, null, ownedRobot);

            // Clear the intervals when disconnecting
            if (connectionIntervalIdRef.current) {
                clearInterval(connectionIntervalIdRef.current);
                connectionIntervalIdRef.current = null;
            }

            // Clear the started interval
            if (startedIntervalIdRef.current) {
                clearInterval(startedIntervalIdRef.current);
                startedIntervalIdRef.current = null;
            }

            const result = await SshControl.disconnect(remoteConfig, nickname);
            console.log('disconnect result', result);
            if (result) {
                setRemoteRobotState(nickname, RemoteRobotStatus.NONE, null, ownedRobot);
                setErrorMessage('');
                onClose();
                toast.success(`Robot ${nickname} disconnected successfully`, {
                    ...toastSuccessDefaults,
                });
            }
        } catch (error) {
            console.error('Failed to disconnect:', error);
            setRemoteRobotState(nickname, RemoteRobotStatus.NONE, null, ownedRobot);
            setErrorMessage(error instanceof Error ? error.message : 'Disconnection failed');
            toast.error(`Robot ${nickname} disconnection failed`, {
                ...toastErrorDefaults,
            });
        }
    };

    const toggleRobot = async () => {
        if (isRobotStarted) {
            await stopRobot();
        } else {
            await startRobot();
        }
    };

    const startRobot = async () => {
        try {
            setRemoteRobotState(nickname, RemoteRobotStatus.STARTING, null, ownedRobot);
            await sshStartRobot(remoteConfig, nickname);
        } catch (error) {
            console.error('Failed to start robot:', error);
            setRemoteRobotState(nickname, RemoteRobotStatus.CONNECTED, null, ownedRobot);
            toast.error(`Failed to start robot ${nickname}`, {
                ...toastErrorDefaults,
            });
        }
    };

    const stopRobot = async () => {
        try {
            setRemoteRobotState(nickname, RemoteRobotStatus.STOPPING, null, ownedRobot);
            await sshStopRobot(remoteConfig, nickname);
        } catch (error) {
            console.error('Failed to stop robot:', error);
            setRemoteRobotState(nickname, RemoteRobotStatus.NONE, null, ownedRobot);
            toast.error(`Failed to stop robot ${nickname}`, {
                ...toastErrorDefaults,
            });
        }
    };

    // Get button styling based on connection state
    const getConnectionButtonStyle = () => {
        if (isRobotConnecting) {
            return 'bg-yellow-500 text-white hover:bg-yellow-400';
        } else if (isRobotDisconnecting) {
            return 'bg-yellow-500 text-white hover:bg-yellow-400';
        } else if (isRobotConnected) {
            return 'bg-red-500 text-white hover:bg-red-400';
        } else {
            return 'bg-green-500 text-white hover:bg-green-400';
        }
    };

    const getConnectionButtonText = () => {
        if (isRobotConnecting) {
            return 'Connecting...';
        } else if (isRobotDisconnecting) {
            return 'Disconnecting...';
        } else if (isRobotConnected) {
            return 'Disconnect From Robot';
        } else {
            return 'Connect To Robot';
        }
    };

    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FaCog className="h-5 w-5 text-slate-400" />
                    <h2 className="text-xl font-semibold text-white">Robot Configuration</h2>
                </div>
                <div className="flex items-center gap-4">
                    {/* Start Robot Button - only show when connected */}

                    {isLoadingConnectionState ? (
                        <div className="flex items-center gap-2">
                            <Spinner />
                        </div>
                    ) : (
                        <>
                            {/* IP Address Display */}
                            {remoteConfig?.remote_ip && (
                                <div className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2">
                                    <FaWifi className="h-3 w-3 text-slate-400" />
                                    <span className="font-mono text-xs text-slate-300">{remoteConfig.remote_ip}</span>
                                </div>
                            )}

                            {isRobotConnected && (
                                <button
                                    onClick={toggleRobot}
                                    disabled={isRobotStarting || isRobotStopping}
                                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-50 ${
                                        isRobotStarted || isRobotStopping
                                            ? 'cursor-pointer bg-red-500 text-white hover:bg-red-400'
                                            : 'bg-green-500 text-white hover:bg-green-400'
                                    }`}
                                >
                                    {isRobotStarted ? (
                                        <FaStop className="h-4 w-4" />
                                    ) : isRobotStarting || isRobotStopping ? (
                                        <FaSpinner className="h-4 w-4 animate-spin" />
                                    ) : (
                                        !isRobotStarted && !isRobotStarting && !isRobotStopping && <FaPlay className="h-4 w-4" />
                                    )}
                                    {isRobotStarting
                                        ? 'Starting Robot...'
                                        : isRobotStopping
                                          ? 'Stopping Robot...'
                                          : isRobotStarted
                                            ? 'Stop Robot'
                                            : 'Start Robot'}
                                </button>
                            )}

                            <button
                                onClick={toggleConnection}
                                disabled={isRobotConnecting || isRobotDisconnecting || isLoadingConnectionState}
                                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-50 ${getConnectionButtonStyle()}`}
                            >
                                {(isRobotConnecting || isRobotDisconnecting) && <FaSpinner className="h-4 w-4 animate-spin" />}
                                {isRobotConnected && !isRobotStarted && <FaWifi className="h-4 w-4" />}
                                {getConnectionButtonText()}
                            </button>
                        </>
                    )}
                    <div className="h-6 w-px bg-slate-600/50"></div>
                    <button
                        onClick={() => setShowConfig(!showConfig)}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-100 ${
                            showConfig ? 'bg-slate-600/80 text-white hover:bg-slate-500/80' : 'bg-blue-500 text-white hover:bg-blue-400'
                        }`}
                    >
                        <FaCog className="h-4 w-4" />
                        {showConfig ? 'Hide Config' : 'Show Config'}
                    </button>
                </div>
            </div>

            {/* Error message display */}
            {robotStatus == RemoteRobotStatus.NONE && errorMessage && (
                <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/20 p-3">
                    <p className="text-sm text-red-300">{errorMessage}</p>
                </div>
            )}

            {showConfig && (
                <div className="mt-4 flex w-full flex-col space-y-3">
                    {/* IP Address Configuration */}
                    <div className="flex w-full items-center gap-4 border-b border-slate-600/30 pb-4">
                        <h3 className="w-36 text-sm font-medium text-white">Robot IP Address</h3>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={remoteConfig?.remote_ip || ''}
                                onChange={(e) => handleIpAddressChange(e.target.value)}
                                placeholder="192.168.1.100"
                                className="w-40 rounded border border-slate-600/50 bg-slate-700/30 px-3 py-2 text-sm text-white placeholder-slate-400 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex w-full items-center gap-12 border-b border-slate-600/30 pb-4">
                        {/* Username Field */}
                        <div className="flex items-center gap-4">
                            <h3 className="w-36 text-sm font-medium text-white">Robot Username</h3>
                            <input
                                type="text"
                                value={remoteConfig?.username || ''}
                                onChange={(e) => handleUsernameChange(e.target.value)}
                                placeholder="robot_user"
                                className="w-40 rounded border border-slate-600/50 bg-slate-700/30 px-3 py-2 text-sm text-white placeholder-slate-400 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                            />
                        </div>

                        {/* Password Field */}
                        <div className="flex items-center gap-4">
                            <h3 className="w-36 text-sm font-medium text-white">Robot Password</h3>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={remoteConfig?.password || ''}
                                    onChange={(e) => handlePasswordChange(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-32 rounded border border-slate-600/50 bg-slate-700/30 px-3 py-2 pr-8 text-sm text-white placeholder-slate-400 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 transition-colors hover:text-white"
                                >
                                    {showPassword ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex w-full items-center gap-12 border-b border-slate-600/30 pb-4">
                        <div className="flex items-center gap-4">
                            <h3 className="w-36 text-sm font-medium text-white">Left Arm Teleop Port</h3>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={remoteConfig?.left_arm_port || ''}
                                    onChange={(e) => handleLeftArmPortChange(e.target.value)}
                                    placeholder="COM3"
                                    className="w-40 rounded border border-slate-600/50 bg-slate-700/30 px-3 py-2 text-sm text-white placeholder-slate-400 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <h3 className="w-36 text-sm font-medium text-white">Right Arm Teleop Port</h3>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={remoteConfig?.right_arm_port || ''}
                                    onChange={(e) => handleRightArmPortChange(e.target.value)}
                                    placeholder="COM8"
                                    className="w-40 rounded border border-slate-600/50 bg-slate-700/30 px-3 py-2 text-sm text-white placeholder-slate-400 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-start gap-4">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={autoCalibrate}
                                className="hover:bg-slate-650 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-all duration-100"
                            >
                                <FaRobot className="h-5 w-5 text-slate-400" />
                                Auto Calibrate
                            </button>
                            {isLoadingAutoCalibrate && (
                                <div className="flex items-center gap-2">
                                    <FaSpinner className="h-5 w-5 animate-spin text-slate-400" />
                                </div>
                            )}
                        </div>
                        <div className="grow"></div>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-8">
                                {isLoadingDetectConfig && (
                                    <div className="flex items-center gap-2">
                                        <FaSpinner className="h-5 w-5 animate-spin text-slate-400" />
                                    </div>
                                )}
                                {detectedConfig && detectedConfig.ports && detectedConfig.ports.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">Ports:</span>
                                        <div className="flex items-center gap-2">
                                            {detectedConfig.ports.map((config: any, index: number) => (
                                                <div key={index} className="bg-slate-850 rounded border border-slate-600 px-3 py-1 text-white">
                                                    {config}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={autoDetectConfig}
                                className="hover:bg-slate-650 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-all duration-100"
                            >
                                <FaCog className="h-5 w-5 text-slate-400" />
                                Detect Config
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export interface RemoteConfig {
    remote_ip: string;
    remote_port: string;
    username: string;
    password: string;
    left_arm_port: string;
    right_arm_port: string;
    keyboard: string;
    fps: number;
}
