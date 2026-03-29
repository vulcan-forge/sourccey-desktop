import { FaGamepad, FaStop, FaPlay, FaWifi } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import { RemoteControlType, RemoteRobotStatus } from '@/hooks/Control/remote-control.hook';
import { setContent } from '@/hooks/Components/OwnedRobots/owned-robots.hook';
import { DEFAULT_DESKTOP_TELEOP_TYPE, useDesktopTeleopCalibrationStatus } from '@/hooks/Control/desktop-calibration.hook';

const ConnectRobotComponent = ({ nickname }: { nickname: string }) => {
    return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-8 backdrop-blur-sm">
            <div className="flex items-center gap-3">
                <FaWifi className="h-8 w-8 text-slate-400" />
                <h2 className="text-xl font-semibold text-white">Robot Not Connected</h2>
            </div>
            <p className="text-center text-slate-300">
                Connect to robot <span className="font-medium text-white">{nickname}</span> to enable remote control
            </p>
        </div>
    );
};

const StartRobotComponent = ({ nickname }: { nickname: string }) => {
    return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-8 backdrop-blur-sm">
            <div className="flex items-center gap-3">
                <FaWifi className="h-8 w-8 text-green-400" />
                <h2 className="text-xl font-semibold text-white">Robot Connected</h2>
            </div>
            <p className="text-center text-slate-300">
                Robot <span className="font-medium text-white">{nickname}</span> is connected but not started
            </p>
        </div>
    );
};

export const RemoteRobotAction = ({
    ownedRobot,
    toggleControl,
    saveEpisode,
    resetEpisode,
    isLoading,
    isControlling,
    robotStatus,
    controlType,
    logs,
    allowUnconnectedControl = false,
}: {
    ownedRobot: any;
    toggleControl: () => void;
    saveEpisode?: (nickname: string) => void;
    resetEpisode?: (nickname: string) => void;
    isLoading: boolean;
    isControlling: boolean;
    robotStatus: RemoteRobotStatus;
    controlType: RemoteControlType;
    logs: boolean;
    allowUnconnectedControl?: boolean;
}) => {
    const nickname = ownedRobot?.nickname ?? '';
    const normalizedNickname = nickname.startsWith('@') ? nickname.slice(1) : nickname;
    const { data: teleopCalibrationStatus, isLoading: isLoadingCalibration }: any = useDesktopTeleopCalibrationStatus(
        normalizedNickname,
        DEFAULT_DESKTOP_TELEOP_TYPE,
        normalizedNickname.length > 0
    );

    const isCalibrationLoading = isLoading || isLoadingCalibration;
    const isTeleopCalibrated = teleopCalibrationStatus?.isCalibrated === true;
    const showCalibrationButton = !isCalibrationLoading && !isTeleopCalibrated;

    // State Variables
    const isConnected = robotStatus == RemoteRobotStatus.CONNECTED || robotStatus == RemoteRobotStatus.STARTED;
    const isRobotStarted = robotStatus == RemoteRobotStatus.STARTED;
    const requiresConnection = !allowUnconnectedControl;
    const isControlDisabled =
        isLoading || isLoadingCalibration || !isTeleopCalibrated || (requiresConnection && robotStatus == RemoteRobotStatus.NONE);

    // Show connect component if not connected
    if (requiresConnection && !isConnected) {
        return <ConnectRobotComponent nickname={nickname} />;
    }

    // Show start robot component if connected but not started
    if (requiresConnection && isConnected && !isRobotStarted) {
        return <StartRobotComponent nickname={nickname} />;
    }

    // Show the full control interface when connected and started
    return (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-start gap-4">
                <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
                    <FaGamepad className="h-5 w-5 text-slate-400" />
                    Remote Robot Control
                </h2>
                <div className="grow"></div>

                {/* Episode control buttons - only show when recording */}
                {isControlling && saveEpisode && resetEpisode && (
                    <>
                        <button
                            onClick={() => saveEpisode?.(nickname)}
                            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-slate-600"
                        >
                            Save Episode
                        </button>
                        <button
                            onClick={() => resetEpisode?.(nickname)}
                            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-slate-600"
                        >
                            Reset Episode
                        </button>
                        <div className="h-8 w-px bg-slate-600"></div>
                    </>
                )}

                {showCalibrationButton && (
                    <button
                        type="button"
                        onClick={() => setContent('config')}
                        className="cursor-pointer rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/30"
                    >
                        Calibrate
                    </button>
                )}

                <button
                    onClick={toggleControl}
                    disabled={isControlDisabled}
                    data-tooltip-id="control-button-tooltip"
                    data-tooltip-content={
                        !requiresConnection
                            ? isControlDisabled
                                ? 'Calibration required before controlling'
                                : ''
                            : !isConnected
                              ? 'Robot must be connected first'
                              : !isRobotStarted
                                ? 'Robot must be started first'
                                : isControlDisabled
                                  ? 'Calibration required before controlling'
                                  : ''
                    }
                    className={`inline-flex w-36 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
                        isControlDisabled
                            ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                            : isControlling
                              ? 'cursor-pointer bg-red-500 text-white hover:bg-red-600'
                              : 'cursor-pointer bg-green-600 text-white hover:bg-green-700'
                    }`}
                >
                    {isCalibrationLoading ? (
                        <span className="animate-spin">⌛</span>
                    ) : isControlling ? (
                        <>
                            <FaStop className="h-4 w-4" /> {remoteStopControlText[controlType as keyof typeof remoteStopControlText]}
                        </>
                    ) : (
                        <>
                            <FaPlay className="h-4 w-4" /> Start Control
                        </>
                    )}
                </button>

                {/* Tooltip for disabled control button */}
                <Tooltip
                    id="control-button-tooltip"
                    place="top"
                    className="custom-tooltip !z-[1000] !max-w-xs !rounded-lg !border-2 !border-slate-600 !bg-slate-700 !px-3 !py-2 !text-sm !break-words !whitespace-pre-wrap !text-slate-100"
                    border="2px solid #475569" // slate-600
                    arrowColor="#334155" // slate-700 (matches bg)
                    classNameArrow="!shadow-none" // optional: prevents tiny inner seam
                />
            </div>
        </div>
    );
};

export const remoteStartControlText = {
    [RemoteControlType.TELEOP]: 'Start Control',
    [RemoteControlType.INFERENCE]: 'Start Inference',
};

export const remoteStopControlText = {
    [RemoteControlType.TELEOP]: 'Stop Control',
    [RemoteControlType.INFERENCE]: 'Stop Inference',
};
