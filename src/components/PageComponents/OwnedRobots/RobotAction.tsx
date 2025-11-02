import { FaGamepad, FaStop } from 'react-icons/fa';
import { FaPlay } from 'react-icons/fa';
import { RobotLogs } from './Training/RobotLogs';
import { useGetCalibration } from '@/hooks/Control/config.hook';
import { Tooltip } from 'react-tooltip';
import { ControlType } from '@/hooks/Control/control.hook';

export const RobotAction = ({
    ownedRobot,
    toggleControl,
    saveEpisode,
    resetEpisode,
    isLoading,
    isControlling,
    controlType,
    logs,
}: {
    ownedRobot: any;
    toggleControl: () => void;
    saveEpisode?: (nickname: string) => void;
    resetEpisode?: (nickname: string) => void;
    isLoading: boolean;
    isControlling: boolean;
    controlType: string;
    logs: boolean;
}) => {
    const nickname = ownedRobot?.nickname ?? '';
    const { data: calibration, isLoading: isLoadingCalibration }: any = useGetCalibration(nickname);

    const isCalibrationLoading = isLoading || isLoadingCalibration;
    const isControlDisabled = isLoading || isLoadingCalibration || !calibration;
    return (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-start gap-4">
                <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
                    <FaGamepad className="h-5 w-5 text-slate-400" />
                    Robot Control
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

                <button
                    onClick={toggleControl}
                    disabled={isControlDisabled}
                    data-tooltip-id="control-button-tooltip"
                    data-tooltip-content={isControlDisabled ? 'Auto calibration required before controlling' : ''}
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
                            <FaStop className="h-4 w-4" /> {stopControlText[controlType as keyof typeof stopControlText]}
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

            {logs && <RobotLogs isControlling={isControlling ?? false} />}
        </div>
    );
};

export const startControlText = {
    [ControlType.TELEOP]: 'Start Control',
    [ControlType.RECORD]: 'Start Record',
    [ControlType.REPLAY]: 'Start Replay',
    [ControlType.EVALUATE]: 'Start Evaluation',
};

export const stopControlText = {
    [ControlType.TELEOP]: 'Stop Control',
    [ControlType.RECORD]: 'Stop Record',
    [ControlType.REPLAY]: 'Stop Replay',
    [ControlType.EVALUATE]: 'Stop Evaluation',
};
