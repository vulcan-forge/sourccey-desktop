'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaArrowRight, FaCheckCircle, FaShieldAlt } from 'react-icons/fa';
import { PrivacyChoices } from '@/components/Elements/Settings/PrivacyChoices';
import { Spinner } from '@/components/Elements/Spinner';
import { usePrivacyPreferences, useSavePrivacyPreferences } from '@/hooks/System/privacy-preferences.hook';
import type { SavePrivacyPreferencesRequest } from '@/types/privacy-preferences';
import { safeNavigate } from '@/utils/navigation';

const emptyChoices: SavePrivacyPreferencesRequest = {
    diagnosticsEnabled: false,
    datasetMetadataEnabled: false,
    trajectoryUploadEnabled: false,
    cameraUploadEnabled: false,
};

export default function PrivacySettingsPage() {
    const router = useRouter();
    const { data, isLoading, error } = usePrivacyPreferences();
    const savePreferences = useSavePrivacyPreferences();
    const [choices, setChoices] = useState<SavePrivacyPreferencesRequest>(emptyChoices);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!data) return;
        setChoices({
            diagnosticsEnabled: data.diagnosticsEnabled,
            datasetMetadataEnabled: data.datasetMetadataEnabled,
            trajectoryUploadEnabled: data.trajectoryUploadEnabled,
            cameraUploadEnabled: data.cameraUploadEnabled,
        });
    }, [data]);

    const handleSave = async () => {
        setSaved(false);
        try {
            await savePreferences.mutateAsync(choices);
            setSaved(true);
        } catch (saveError) {
            console.error('Failed to save privacy preferences:', saveError);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 sm:px-8 sm:py-10">
                <header className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-2xl sm:p-8">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                            <div className="rounded-xl bg-emerald-400/10 p-3 text-emerald-300">
                                <FaShieldAlt />
                            </div>
                            <div>
                                <h1 className="text-2xl font-semibold text-white sm:text-3xl">Privacy & Data</h1>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                                    Control optional information sent to Vulcan. Local robot operation and local recordings continue to work
                                    when every option is off.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => safeNavigate(router, '/desktop/onboarding/')}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-600 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-amber-300 hover:text-white"
                        >
                            Review onboarding <FaArrowRight />
                        </button>
                    </div>
                </header>

                <section className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-5 shadow-xl sm:p-6">
                    {isLoading ? (
                        <div className="flex min-h-48 items-center justify-center">
                            <Spinner color="yellow" width="w-6" height="h-6" />
                        </div>
                    ) : error ? (
                        <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
                            Privacy preferences could not be loaded.
                        </div>
                    ) : (
                        <>
                            <PrivacyChoices
                                value={choices}
                                onChange={(next) => {
                                    setChoices(next);
                                    setSaved(false);
                                }}
                                disabled={savePreferences.isPending}
                            />
                            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-700 pt-5">
                                <div className="text-xs text-slate-500">
                                    {saved ? (
                                        <span className="inline-flex items-center gap-2 text-emerald-300">
                                            <FaCheckCircle /> Preferences saved
                                        </span>
                                    ) : (
                                        ''
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handleSave()}
                                    disabled={savePreferences.isPending}
                                    className="cursor-pointer rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {savePreferences.isPending ? 'Saving...' : 'Save preferences'}
                                </button>
                            </div>
                            {savePreferences.error && (
                                <p className="mt-4 text-sm text-red-300">Preferences could not be saved. Please try again.</p>
                            )}
                        </>
                    )}
                </section>

                <section className="rounded-2xl border border-slate-700 bg-slate-950/45 p-5 text-sm text-slate-400">
                    Turning sharing off prevents new dataset metadata transfers and cancels transfers that have not started. An in-progress
                    request may finish before the change takes effect. Data already received by Vulcan is not automatically deleted.
                </section>
            </div>
        </div>
    );
}
