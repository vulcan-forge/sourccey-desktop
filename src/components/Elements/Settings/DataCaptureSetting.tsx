'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { getDataCaptureEnabled, setDataCaptureEnabled } from '@/settings/data-capture';

export function DataCaptureSetting() {
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        try {
            setEnabled(getDataCaptureEnabled());
        } catch {
            // Keep the enabled default if storage is unavailable.
        }
    }, []);

    const handleToggle = () => {
        const nextEnabled = !enabled;
        setEnabled(nextEnabled);

        try {
            setDataCaptureEnabled(nextEnabled);
        } catch {
            // The in-memory preference still works for this session.
        }
    };

    return (
        <div className="border-t border-slate-700/70 px-1 pt-5">
            <div className="flex items-center justify-between gap-6">
                <div>
                    <div className="text-sm font-medium text-slate-300">Data capture</div>
                    <p className="mt-1 text-xs text-slate-500">Allow sending telemetry data to help improve the product.</p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label="Allow sending telemetry data"
                    onClick={handleToggle}
                    className={clsx(
                        'relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus:ring-2 focus:ring-slate-400/50 focus:ring-offset-2 focus:ring-offset-slate-900 focus:outline-none',
                        enabled ? 'border-slate-400/60 bg-slate-500/70' : 'border-slate-700 bg-slate-800/70'
                    )}
                >
                    <span
                        aria-hidden="true"
                        className={clsx(
                            'inline-block h-4 w-4 rounded-full bg-slate-300 shadow-sm transition-transform',
                            enabled ? 'translate-x-5' : 'translate-x-1'
                        )}
                    />
                </button>
            </div>
        </div>
    );
}
