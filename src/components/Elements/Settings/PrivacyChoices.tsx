'use client';

import clsx from 'clsx';
import type { IconType } from 'react-icons';
import { FaBug } from 'react-icons/fa';
import { MdPrecisionManufacturing } from 'react-icons/md';
import {
    applyAiRecordingContributionChoice,
    applyProductImprovementChoice,
    isAiRecordingContributionEnabled,
    isProductImprovementEnabled,
} from '@/settings/privacy-preferences';
import type { SavePrivacyPreferencesRequest } from '@/types/privacy-preferences';

type PrivacyChoicesProps = {
    value: SavePrivacyPreferencesRequest;
    onChange: (value: SavePrivacyPreferencesRequest) => void;
    disabled?: boolean;
};

const choices: Array<{
    key: string;
    title: string;
    description: string;
    icon: IconType;
    tone: string;
    isEnabled: (value: SavePrivacyPreferencesRequest) => boolean;
    update: (value: SavePrivacyPreferencesRequest, enabled: boolean) => SavePrivacyPreferencesRequest;
}> = [
    {
        key: 'product-improvement',
        title: 'Diagnostics & dataset metadata',
        description: 'Share app diagnostics, performance information, and dataset details. No trajectories or vision data.',
        icon: FaBug,
        tone: 'text-sky-300 bg-sky-400/10',
        isEnabled: isProductImprovementEnabled,
        update: applyProductImprovementChoice,
    },
    {
        key: 'ai-recordings',
        title: 'Project trajectories & vision data',
        description: 'Share recorded robot states, actions, images, and video to improve Sourccey’s AI.',
        icon: MdPrecisionManufacturing,
        tone: 'text-emerald-300 bg-emerald-400/10',
        isEnabled: isAiRecordingContributionEnabled,
        update: applyAiRecordingContributionChoice,
    },
];

export function PrivacyChoices({ value, onChange, disabled = false }: PrivacyChoicesProps) {
    return (
        <div className="grid gap-3">
            {choices.map(({ key, title, description, icon: Icon, tone, isEnabled, update }) => {
                const enabled = isEnabled(value);
                return (
                    <div
                        key={key}
                        className={clsx(
                            'flex items-start gap-4 rounded-2xl border p-4 transition sm:p-5',
                            enabled ? 'border-amber-300/40 bg-amber-300/5' : 'border-amber-200/15 bg-slate-950/35'
                        )}
                    >
                        <div className={clsx('mt-0.5 rounded-xl p-2.5', tone)}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-white">{title}</div>
                            <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            aria-label={`Share ${title.toLowerCase()}`}
                            disabled={disabled}
                            onClick={() => onChange(update(value, !enabled))}
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
