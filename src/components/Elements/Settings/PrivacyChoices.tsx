'use client';

import clsx from 'clsx';
import type { IconType } from 'react-icons';
import { FaChartLine } from 'react-icons/fa';
import { MdPrecisionManufacturing } from 'react-icons/md';
import {
    applyDataSharingChoice,
    applyTelemetryChoice,
    isDataSharingEnabled,
    isTelemetryEnabled,
} from '@/settings/privacy-preferences';
import type { SavePrivacyPreferencesRequest } from '@/types/privacy-preferences';

type PrivacyChoicesProps = {
    value: SavePrivacyPreferencesRequest;
    onChange: (value: SavePrivacyPreferencesRequest) => void;
    disabled?: boolean;
};

type PrivacyChoice = {
    key: string;
    title: string;
    description: string;
    ariaLabel: string;
    icon: IconType;
    iconClassName: string;
    isEnabled: (value: SavePrivacyPreferencesRequest) => boolean;
    apply: (value: SavePrivacyPreferencesRequest, enabled: boolean) => SavePrivacyPreferencesRequest;
};

const privacyChoices: PrivacyChoice[] = [
    {
        key: 'telemetry',
        title: 'Share telemetry',
        description: 'Send optional app diagnostics, reliability information, and performance telemetry to help improve Sourccey.',
        ariaLabel: 'Share telemetry with Vulcan',
        icon: FaChartLine,
        iconClassName: 'bg-sky-400/10 text-sky-300',
        isEnabled: isTelemetryEnabled,
        apply: applyTelemetryChoice,
    },
    {
        key: 'robot-data',
        title: 'Share robot data',
        description:
            'Allow Sourccey Sync to send eligible recording data. Vulcan controls whether metadata only, full datasets, or no dataset data is requested. Turning this off always stops dataset sharing.',
        ariaLabel: 'Share robot data with Vulcan',
        icon: MdPrecisionManufacturing,
        iconClassName: 'bg-emerald-400/10 text-emerald-300',
        isEnabled: isDataSharingEnabled,
        apply: applyDataSharingChoice,
    },
];

export function PrivacyChoices({ value, onChange, disabled = false }: PrivacyChoicesProps) {
    return (
        <div className="grid gap-3">
            {privacyChoices.map((choice) => {
                const enabled = choice.isEnabled(value);
                const Icon = choice.icon;

                return (
                    <div
                        key={choice.key}
                        className={clsx(
                            'flex items-start gap-4 rounded-2xl border p-4 transition sm:p-5',
                            enabled ? 'border-amber-300/40 bg-amber-300/5' : 'border-amber-200/15 bg-slate-950/35'
                        )}
                    >
                        <div className={clsx('mt-0.5 rounded-xl p-2.5', choice.iconClassName)}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-white">{choice.title}</div>
                            <p className="mt-1 text-xs leading-5 text-slate-400">{choice.description}</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            aria-label={choice.ariaLabel}
                            disabled={disabled}
                            onClick={() => onChange(choice.apply(value, !enabled))}
                            className={clsx(
                                'relative mt-1 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                                enabled ? 'border-amber-300/70 bg-amber-400' : 'border-slate-600 bg-slate-800'
                            )}
                        >
                            <span
                                aria-hidden="true"
                                className={clsx(
                                    'inline-block h-4 w-4 rounded-full shadow-sm transition-transform',
                                    enabled ? 'translate-x-6 bg-slate-950' : 'translate-x-1 bg-slate-300'
                                )}
                            />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
