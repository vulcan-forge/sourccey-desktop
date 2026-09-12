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
        <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between gap-6">
                <div>
                    <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
                        Data Capture
                    </div>
                    <p className="mt-2 text-sm text-slate-300">Allow sending telemetry data to help improve the product.</p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label="Allow sending telemetry data"
                    onClick={handleToggle}
                    className={clsx(
                        'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus:ring-2 focus:ring-amber-400/60 focus:ring-offset-2 focus:ring-offset-slate-900 focus:outline-none',
                        enabled ? 'border-amber-400 bg-amber-500' : 'border-slate-500 bg-slate-700'
                    )}
                >
                    <span
                        aria-hidden="true"
                        className={clsx(
                            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
                            enabled ? 'translate-x-6' : 'translate-x-1'
                        )}
                    />
                </button>
            </div>
        </div>
    );
}
