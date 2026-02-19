'use client';

import { useEffect, useState } from 'react';
import { FaPlay, FaTimes } from 'react-icons/fa';

type SelectedModelPanelProps = {
    model: {
        id: string;
        name: string;
        model_path: string;
    };
    onClear: () => void;
    logsSlot?: React.ReactNode;
};

export const SelectedModelPanel = ({ model, onClear, logsSlot }: SelectedModelPanelProps) => {
    const [isRunning, setIsRunning] = useState(false);

    useEffect(() => {
        setIsRunning(false);
    }, [model.id]);

    return (
        <div className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-orange-500/10 p-5">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm font-semibold text-white">Selected Model</div>
                    <div className="text-xs text-amber-100">{model.name}</div>
                </div>
                <button
                    type="button"
                    onClick={onClear}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:border-amber-400/70"
                >
                    <FaTimes className="h-3 w-3" />
                    Clear
                </button>
            </div>
            <div className="mt-3 text-xs text-slate-300">
                <span className="text-slate-100">Path:</span> {model.model_path}
            </div>
            <div className="mt-4">
                <button
                    type="button"
                    onClick={() => setIsRunning(true)}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 px-4 py-2 text-xs font-semibold text-white transition-all hover:from-red-500/90 hover:via-orange-500/90 hover:to-yellow-500/90"
                >
                    {isRunning ? (
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/80 border-t-transparent"></div>
                    ) : (
                        <FaPlay className="h-3.5 w-3.5" />
                    )}
                    {isRunning ? 'Starting...' : 'Run Model'}
                </button>
            </div>

            {logsSlot && <div className="mt-4">{logsSlot}</div>}
        </div>
    );
};
