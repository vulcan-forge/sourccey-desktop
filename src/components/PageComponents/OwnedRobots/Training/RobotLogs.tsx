import { filterLogs, setupProcessShutdownListeners, setupLogListeners } from '@/utils/logs/control-logs/control-logs';
import { useState, useEffect, useRef, useCallback } from 'react';
import { FaTerminal, FaChevronDown, FaChevronUp } from 'react-icons/fa';

export const RobotLogs = ({ isControlling }: { isControlling: boolean }) => {
    const [controlLogs, setControlLogs] = useState<string[]>([]);
    const [isExpanded, setIsExpanded] = useState(isControlling);
    const logsRef = useRef<string[]>([]);

    // Update internal state when external prop changes
    useEffect(() => {
        setIsExpanded(isControlling);
        // if (!isControlling) {
        //     logsRef.current = [];
        //     setControlLogs([]);
        // }
    }, [isControlling]);

    useEffect(() => {
        if (isControlling) {
            const setupListeners = async () => {
                // Create a callback function to handle incoming logs
                const handleLogReceived = (log: string) => {
                    // Add to current logs and update state immediately
                    const filteredCurrentLogs = filterLogs(logsRef.current);
                    const newLogs = [...filteredCurrentLogs, log].slice(-100);

                    logsRef.current = newLogs;
                    setControlLogs(newLogs);
                };

                // Set up log listeners with bulletproof singleton
                await setupLogListeners(handleLogReceived);

                // Set up process shutdown listeners
                await setupProcessShutdownListeners();
            };

            setupListeners();

            // Return a cleanup function that does nothing since we're using singletons
            return () => {};
        }
    }, [isControlling]);

    return (
        <div className="bg-slate-825 overflow-hidden rounded-xl border-2 border-slate-700 backdrop-blur-sm">
            <div className="bg-slate-825 flex items-center justify-between border-b border-slate-700 p-4">
                <div className="flex items-center gap-3">
                    <FaTerminal className="h-5 w-5 text-slate-400" />
                    <h3 className="text-lg font-semibold text-white">Control Logs</h3>
                    {isControlling && (
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                            <span className="text-sm text-slate-400">Live</span>
                        </div>
                    )}
                    {!isControlling && (
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-red-400" />
                            <span className="text-sm text-slate-400">Inactive</span>
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-slate-700/60"
                >
                    {isExpanded ? (
                        <>
                            <FaChevronUp className="h-4 w-4" />
                            Hide
                        </>
                    ) : (
                        <>
                            <FaChevronDown className="h-4 w-4" />
                            Show
                        </>
                    )}
                </button>
            </div>

            {isExpanded && (
                <>
                    <div className="scrollbar scrollbar-thumb-slate-600 scrollbar-track-slate-800 h-[500px] overflow-y-auto bg-slate-900/50 font-mono">
                        <div className="space-y-0.5 p-4">
                            {controlLogs.length > 0 ? (
                                controlLogs.slice(-50).map((log, index) => (
                                    <div key={index} className="text-xs leading-relaxed text-slate-400">
                                        {log}
                                    </div>
                                ))
                            ) : (
                                <div className="text-sm text-slate-400">
                                    {isControlling ? 'Waiting for control data...' : 'Robot control has not started yet'}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-slate-825 border-t border-slate-700 p-3">
                        <div className="flex items-center justify-between font-mono text-xs text-slate-400">
                            <span>ENTRIES: {controlLogs.length}</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
