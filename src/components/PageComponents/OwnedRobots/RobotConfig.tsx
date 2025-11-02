import { useState, useEffect } from 'react';
import { FaCog, FaDownload, FaRobot, FaSpinner, FaUpload } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { setConfig, useGetConfig } from '@/hooks/Control/config.hook';

export const RobotConfig = ({ ownedRobot }: { ownedRobot: any }) => {
    const nickname = ownedRobot?.nickname ?? '';
    const [showConfig, setShowConfig] = useState(false);
    const { data: config, isLoading: isLoadingConfig }: any = useGetConfig(nickname as string);

    const [showCameraDetails, setShowCameraDetails] = useState<{ [key: string]: boolean }>({});
    const [editingArmId, setEditingArmId] = useState<{ [key: string]: string }>({});

    // Loading state
    const [isLoadingAutoCalibrate, setIsLoadingAutoCalibrate] = useState(false);
    const [detectedConfig, setDetectedConfig] = useState<any>(null);
    const [isLoadingDetectConfig, setIsLoadingDetectConfig] = useState(false);

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const configData = await invoke<Config>('read_config', { nickname });
                setConfig(nickname, configData);
            } catch (error) {
                console.error('Failed to load config:', error);
            }
        };
        loadConfig();
    }, [nickname]);

    const saveConfig = async (newConfig: any) => {
        try {
            // Ensure all camera_index values are valid numbers before saving
            const configToSave = JSON.parse(JSON.stringify(newConfig));
            Object.values(configToSave.cameras).forEach((camera: any) => {
                if (
                    camera.camera_index === '' ||
                    camera.camera_index === null ||
                    camera.camera_index === undefined ||
                    camera.camera_index < 0
                ) {
                    camera.camera_index = 0;
                }
            });

            await invoke('write_config', { config: configToSave, nickname });
        } catch (error) {
            console.error('Failed to save config:', error);
        }
    };

    const handlePortChange = async (armType: 'leader_arms' | 'follower_arms', armId: string, value: string) => {
        const newConfig: any = JSON.parse(JSON.stringify(config));
        if (!newConfig[armType][armId]) {
            return;
        }
        newConfig[armType][armId].port = value;
        setConfig(nickname, newConfig);
        await saveConfig(newConfig);
    };

    //////////////////////////////////////////////////////////////////////////////////
    // Arm config functions
    //////////////////////////////////////////////////////////////////////////////////
    const addArm = async (armType: 'leader_arms' | 'follower_arms') => {
        const newConfig: any = JSON.parse(JSON.stringify(config));
        const newArmId = `arm_${Object.keys(newConfig[armType]).length + 1}`;
        newConfig[armType][newArmId] = {
            port: `COM${Math.floor(Math.random() * 20) + 1}`, // Random COM port as default
        };
        setConfig(nickname, newConfig);
        await saveConfig(newConfig);
    };

    const removeArm = async (armType: 'leader_arms' | 'follower_arms', armId: string) => {
        const newConfig: any = JSON.parse(JSON.stringify(config));
        delete newConfig[armType][armId];
        setConfig(nickname, newConfig);
        await saveConfig(newConfig);
    };

    const renameArm = async (armType: 'leader_arms' | 'follower_arms', oldId: string, newId: string) => {
        if (oldId === newId) return;

        const newConfig: any = JSON.parse(JSON.stringify(config));
        const armData = newConfig[armType][oldId];
        delete newConfig[armType][oldId];
        if (!armData) {
            return;
        }
        newConfig[armType][newId] = armData;

        // Update state immediately for better UX
        setConfig(nickname, newConfig);

        // Then save to backend
        try {
            await saveConfig(newConfig);
        } catch (error) {
            // If save fails, revert the change
            console.error('Failed to save arm rename:', error);
            setConfig(nickname, config);
        }
    };

    //////////////////////////////////////////////////////////////////////////////////
    // Camera config functions
    //////////////////////////////////////////////////////////////////////////////////
    const handleCameraChange = async (view: string, field: keyof Camera, value: string | number) => {
        const newConfig = JSON.parse(JSON.stringify(config));

        if (!newConfig.cameras[view]) {
            return;
        }

        if (typeof value === 'number' && value < 0) {
            value = 0;
        }

        // Store the raw value (including empty string) in the config for UI
        newConfig.cameras[view][field] = value;

        // Update the UI immediately
        setConfig(nickname, newConfig);

        // Create a copy for saving with empty strings and negative values converted to 0
        const configForSaving = JSON.parse(JSON.stringify(newConfig));
        if (field === 'camera_index') {
            const indexValue = configForSaving.cameras[view][field];
            if (indexValue === '' || indexValue === null || indexValue === undefined || indexValue < 0) {
                configForSaving.cameras[view][field] = 0;
            }
        }

        await saveConfig(configForSaving);
    };

    const addCamera = async () => {
        const newConfig: any = JSON.parse(JSON.stringify(config));
        const newCameraId = `camera_${Object.keys(newConfig.cameras).length + 1}`;
        newConfig.cameras[newCameraId] = {
            type: 'opencv',
            camera_index: Object.keys(newConfig.cameras).length,
            fps: 10,
            width: 640,
            height: 480,
            color_mode: 'rgb',
        };
        setConfig(nickname, newConfig);
        await saveConfig(newConfig);
    };

    const removeCamera = async (cameraId: string) => {
        const newConfig: any = JSON.parse(JSON.stringify(config));
        delete newConfig.cameras[cameraId];
        setConfig(nickname, newConfig);
        await saveConfig(newConfig);
    };

    const renameCamera = async (oldId: string, newId: string) => {
        const newConfig: any = JSON.parse(JSON.stringify(config));
        const cameraData = newConfig.cameras[oldId];
        delete newConfig.cameras[oldId];
        if (!cameraData) {
            return;
        }
        newConfig.cameras[newId] = cameraData;
        setConfig(nickname, newConfig);
        await saveConfig(newConfig);
    };

    const downloadConfig = () => {
        // Create a blob with the current config
        const configBlob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });

        // Create a URL for the blob
        const url = URL.createObjectURL(configBlob);

        // Create a temporary link element
        const link = document.createElement('a');
        link.href = url;
        link.download = 'config.json';

        // Append to body, click, and remove
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the URL
        URL.revokeObjectURL(url);
    };

    const handleConfigUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const newConfig: any = JSON.parse(text);

            // Validate the config structure
            if (!newConfig.leader_arms || !newConfig.follower_arms || !newConfig.cameras) {
                throw new Error('Invalid config file structure');
            }

            // Update the config and save it
            setConfig(nickname, newConfig);
            await saveConfig(newConfig);

            // Reset the file input
            event.target.value = '';
        } catch (error) {
            console.error('Failed to load config file:', error);
            // You might want to show an error message to the user here
        }
    };

    const autoCalibrate = async () => {
        setIsLoadingAutoCalibrate(true);

        try {
            const followerArmKey = Object.keys(config?.follower_arms)[0] as string;
            const leaderArmKey = Object.keys(config?.leader_arms)[0] as string;
            const calibrationConfig: CalibrationConfig = {
                nickname: nickname,
                robot_type: 'so100_follower',
                teleop_type: 'so100_leader',
                robot_port: config?.follower_arms?.[followerArmKey]?.port,
                teleop_port: config?.leader_arms?.[leaderArmKey]?.port,
            };
            const result: any = await invoke('auto_calibrate', { config: calibrationConfig });
            toast.success('Auto calibration successful!', {
                ...toastSuccessDefaults,
            });
        } catch (error) {
            console.error('Failed to auto calibrate:', error);
            toast.error('Failed to auto calibrate, please turn on your robots and / or power supplies and try again', {
                ...toastErrorDefaults,
            });
        } finally {
            setIsLoadingAutoCalibrate(false);
        }
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

    return (
        <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FaCog className="h-5 w-5 text-slate-400" />
                    <h2 className="text-xl font-semibold text-white">Robot Configuration</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={downloadConfig}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600/50 bg-slate-700/80 px-4 py-2 text-sm font-medium text-slate-200 transition-all duration-200 hover:border-slate-500/50 hover:bg-slate-600/80 hover:text-white"
                    >
                        <FaDownload className="h-4 w-4" />
                        Download Config
                    </button>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600/50 bg-slate-700/80 px-4 py-2 text-sm font-medium text-slate-200 transition-all duration-200 hover:border-slate-500/50 hover:bg-slate-600/80 hover:text-white">
                        <FaUpload className="h-4 w-4" />
                        Upload Config
                        <input type="file" accept=".json" onChange={handleConfigUpload} className="hidden" />
                    </label>
                    <div className="mx-2 h-6 w-px bg-slate-600/50"></div>
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

            {showConfig && (
                <div className="mt-4 flex w-full flex-col space-y-3">
                    {/* Leader Arms Configuration */}
                    <div className="flex w-full items-center gap-4">
                        <h3 className="w-24 text-sm font-medium text-white">Leader Arms</h3>
                        <div className="flex items-center gap-2">
                            {Object.entries(config.leader_arms).map(([armId, armData]: any) => {
                                return (
                                    <div
                                        key={armId}
                                        className="flex items-center gap-2 rounded border border-slate-600/50 bg-slate-800/40 px-3 py-2"
                                    >
                                        <input
                                            type="text"
                                            value={editingArmId[`leader_${armId}`] ?? armId}
                                            onChange={(e) => setEditingArmId((prev) => ({ ...prev, [`leader_${armId}`]: e.target.value }))}
                                            onBlur={(e) => {
                                                const newId = e.target.value;
                                                if (newId !== armId) renameArm('leader_arms', armId, newId);
                                                setEditingArmId((prev) => {
                                                    const newState = { ...prev };
                                                    delete newState[`leader_${armId}`];
                                                    return newState;
                                                });
                                            }}
                                            className="w-20 bg-transparent text-sm font-medium text-slate-200 focus:outline-none"
                                        />
                                        <span className="text-xs text-slate-400">Port:</span>
                                        <input
                                            type="text"
                                            value={armData.port as string}
                                            onChange={(e) => handlePortChange('leader_arms', armId, e.target.value)}
                                            className="w-16 rounded border border-slate-600/50 bg-slate-700/30 px-2 py-1 text-xs text-white focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                                        />
                                        {Object.keys(config.leader_arms).length > 1 && (
                                            <button
                                                onClick={() => removeArm('leader_arms', armId)}
                                                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-red-500/50 bg-red-500/80 text-white hover:bg-red-400/80"
                                            >
                                                <span className="text-xs font-bold">×</span>
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="grow"></div>
                        <button
                            onClick={() => addArm('leader_arms')}
                            className="inline-flex cursor-pointer items-center gap-1 rounded bg-green-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                        >
                            <span>+</span> Add
                        </button>
                    </div>

                    {/* Follower Arms Configuration */}
                    <div className="flex items-center gap-4">
                        <h3 className="w-24 text-sm font-medium text-white">Follower Arms</h3>
                        <div className="flex items-center gap-2">
                            {Object.entries(config.follower_arms).map(([armId, armData]: any) => (
                                <div
                                    key={armId}
                                    className="flex items-center gap-2 rounded border border-slate-600/50 bg-slate-800/40 px-3 py-2"
                                >
                                    <input
                                        type="text"
                                        value={editingArmId[`follower_${armId}`] ?? armId}
                                        onChange={(e) => setEditingArmId((prev) => ({ ...prev, [`follower_${armId}`]: e.target.value }))}
                                        onBlur={(e) => {
                                            const newId = e.target.value;
                                            if (newId !== armId) renameArm('follower_arms', armId, newId);
                                            setEditingArmId((prev) => {
                                                const newState = { ...prev };
                                                delete newState[`follower_${armId}`];
                                                return newState;
                                            });
                                        }}
                                        className="w-20 bg-transparent text-sm font-medium text-slate-200 focus:outline-none"
                                    />
                                    <span className="text-xs text-slate-400">Port:</span>
                                    <input
                                        type="text"
                                        value={armData.port}
                                        onChange={(e) => handlePortChange('follower_arms', armId, e.target.value)}
                                        className="w-16 rounded border border-slate-600/50 bg-slate-700/30 px-2 py-1 text-xs text-white focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                                    />
                                    {Object.keys(config.follower_arms).length > 1 && (
                                        <button
                                            onClick={() => removeArm('follower_arms', armId)}
                                            className="flex h-5 w-5 items-center justify-center rounded border border-red-500/50 bg-red-500/80 text-white hover:bg-red-400/80"
                                        >
                                            <span className="text-xs font-bold">×</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="grow"></div>
                        <button
                            onClick={() => addArm('follower_arms')}
                            className="inline-flex cursor-pointer items-center gap-1 rounded bg-green-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                        >
                            <span>+</span> Add
                        </button>
                    </div>

                    {/* Cameras Configuration */}
                    <div className="flex items-center gap-4">
                        <h3 className="w-24 text-sm font-medium text-white">Cameras</h3>
                        <div className="flex items-center gap-2">
                            {Object.entries(config.cameras).map(([view, cameraData]: any) => (
                                <div
                                    key={view}
                                    className="flex items-center gap-2 rounded border border-slate-600/50 bg-slate-800/40 px-3 py-2"
                                >
                                    <input
                                        type="text"
                                        value={view}
                                        onChange={(e) => renameCamera(view, e.target.value)}
                                        className="w-20 bg-transparent text-sm font-medium text-slate-200 focus:outline-none"
                                    />
                                    <span className="text-xs text-slate-400">Index:</span>
                                    <input
                                        type="number"
                                        value={
                                            typeof cameraData?.camera_index === 'number' && !isNaN(cameraData.camera_index)
                                                ? cameraData.camera_index
                                                : ''
                                        }
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const parsed = parseInt(val);
                                            handleCameraChange(view, 'camera_index', val === '' || isNaN(parsed) ? '' : parsed);
                                        }}
                                        className="w-16 rounded border border-slate-600/50 bg-slate-700/30 px-2 py-1 text-xs text-white focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                                    />
                                    <button
                                        onClick={() => setShowCameraDetails((prev) => ({ ...prev, [view]: !prev[view] }))}
                                        className="inline-flex cursor-pointer items-center gap-1 rounded bg-gray-700 px-2 py-1 text-xs font-medium text-white transition-all duration-300 hover:bg-gray-800"
                                    >
                                        {showCameraDetails[view] ? 'Hide' : 'Details'}
                                    </button>
                                    {Object.keys(config.cameras).length > 1 && (
                                        <button
                                            onClick={() => removeCamera(view)}
                                            className="flex h-5 w-5 items-center justify-center rounded border border-red-500/50 bg-red-500/80 text-white hover:bg-red-400/80"
                                        >
                                            <span className="text-xs font-bold">×</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="grow"></div>
                        <button
                            onClick={addCamera}
                            className="inline-flex cursor-pointer items-center gap-1 rounded bg-green-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                        >
                            <span>+</span> Add
                        </button>
                    </div>

                    {/* Camera Details (collapsible) */}
                    {Object.entries(config.cameras).map(
                        ([view, cameraData]: any) =>
                            showCameraDetails[view] && (
                                <div
                                    key={`${view}-details`}
                                    className="ml-28 flex items-center gap-4 rounded border border-slate-600/50 bg-slate-800/20 p-3"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">FPS:</span>
                                        <input
                                            type="number"
                                            value={cameraData.fps}
                                            onChange={(e) => handleCameraChange(view, 'fps', parseInt(e.target.value))}
                                            className="w-16 rounded border border-slate-600/50 bg-slate-700/30 px-2 py-1 text-xs text-white focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">Width:</span>
                                        <input
                                            type="number"
                                            value={cameraData.width}
                                            onChange={(e) => handleCameraChange(view, 'width', parseInt(e.target.value))}
                                            className="w-16 rounded border border-slate-600/50 bg-slate-700/30 px-2 py-1 text-xs text-white focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">Height:</span>
                                        <input
                                            type="number"
                                            value={cameraData.height}
                                            onChange={(e) => handleCameraChange(view, 'height', parseInt(e.target.value))}
                                            className="w-16 rounded border border-slate-600/50 bg-slate-700/30 px-2 py-1 text-xs text-white focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">Mode:</span>
                                        <select
                                            value={cameraData.color_mode}
                                            onChange={(e) => handleCameraChange(view, 'color_mode', e.target.value)}
                                            className="w-20 rounded border border-slate-600/50 bg-slate-700/30 px-2 py-1 text-xs text-white focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                                        >
                                            <option value="rgb">RGB</option>
                                            <option value="bgr">BGR</option>
                                            <option value="gray">Gray</option>
                                        </select>
                                    </div>
                                </div>
                            )
                    )}

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
                                {detectedConfig && detectedConfig.cameras && detectedConfig.cameras.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">Cameras:</span>
                                        <div className="flex items-center gap-2">
                                            {detectedConfig.cameras.map((config: any, index: number) => (
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

interface Arm {
    port: string;
}

interface Camera {
    type: string;
    camera_index: number;
    fps: number;
    width: number;
    height: number;
    color_mode: string;
}

interface CameraConfig {
    [key: string]: Camera;
}

export interface Config {
    leader_arms: {
        [key: string]: Arm;
    };
    follower_arms: {
        [key: string]: Arm;
    };
    cameras: CameraConfig;
}

export interface Calibration {
    [key: string]: MotorCalibration;
}

export interface MotorCalibration {
    id: number;
    drive_mode: number;
    homing_offset: number;
    range_min: number;
    range_max: number;
}

//----------------------------------------------------------//
// Config Config
//----------------------------------------------------------//

export interface ConfigConfig {
    nickname: string;
    robot_type: string;
}

//----------------------------------------------------------//
// Calibration Config
//----------------------------------------------------------//

export interface CalibrationConfig {
    nickname: string;
    robot_type: string;
    teleop_type: string;
    robot_port: string;
    teleop_port: string;
}
