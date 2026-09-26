'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FaArrowRight } from 'react-icons/fa';
import { AppBootScreen } from '@/components/Elements/AppBootScreen';
import { usePrivacyPreferences, useSavePrivacyPreferences } from '@/hooks/System/privacy-preferences.hook';
import {
    applyAiRecordingContributionChoice,
    applyProductImprovementChoice,
    isAiRecordingContributionEnabled,
    isProductImprovementEnabled,
} from '@/settings/privacy-preferences';
import type { SavePrivacyPreferencesRequest } from '@/types/privacy-preferences';
import { safeNavigate } from '@/utils/navigation';

const disabledChoices: SavePrivacyPreferencesRequest = {
    diagnosticsEnabled: false,
    datasetMetadataEnabled: false,
    trajectoryUploadEnabled: false,
    cameraUploadEnabled: false,
};

export default function OnboardingPage() {
    const router = useRouter();
    const { data: preferences, isLoading, error } = usePrivacyPreferences();
    const savePreferences = useSavePrivacyPreferences();
    const [step, setStep] = useState<1 | 2>(1);
    const [choices, setChoices] = useState<SavePrivacyPreferencesRequest>(disabledChoices);
    const productImprovementEnabled = isProductImprovementEnabled(choices);
    const aiRecordingContributionEnabled = isAiRecordingContributionEnabled(choices);

    useEffect(() => {
        if (!preferences) return;
        setChoices({
            diagnosticsEnabled: preferences.diagnosticsEnabled,
            datasetMetadataEnabled: preferences.datasetMetadataEnabled,
            trajectoryUploadEnabled: preferences.trajectoryUploadEnabled,
            cameraUploadEnabled: preferences.cameraUploadEnabled,
        });
    }, [preferences]);

    const finishOnboarding = async () => {
        try {
            await savePreferences.mutateAsync(choices);
            safeNavigate(router, '/desktop/setup/');
        } catch (saveError) {
            console.error('Failed to finish onboarding:', saveError);
        }
    };

    if (isLoading) return <AppBootScreen message="Preparing your welcome experience..." />;

    return (
        <div className="min-h-screen w-full overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.16),transparent_32%),linear-gradient(135deg,#0f172a,#1e293b_48%,#0f172a)] text-white">
            <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-8 sm:px-8">
                <div className="flex flex-1 items-center justify-center">
                    {step === 1 ? (
                        <section className="flex w-full max-w-3xl flex-col items-center text-center">
                            <div className="relative">
                                <div className="absolute inset-0 rounded-3xl bg-orange-400/35 blur-2xl" />
                                <div className="relative rounded-3xl border border-amber-200/20 bg-slate-950/55 p-4 shadow-2xl">
                                    <Image src="/assets/logo/SourcceyLogo.png" alt="Vulcan Studio" width={76} height={76} priority />
                                </div>
                            </div>
                            <h1 className="mt-8 text-5xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
                                Welcome to <span className="bg-linear-to-r from-yellow-300 via-amber-300 to-orange-400 bg-clip-text text-transparent">Vulcan Studio</span>
                            </h1>
                            <p className="mt-5 max-w-xl text-base text-slate-300 sm:text-lg">
                                Set up your robot workspace and choose what you share.
                            </p>
                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                className="mt-9 inline-flex min-h-14 cursor-pointer items-center justify-center gap-3 rounded-2xl bg-linear-to-r from-yellow-300 via-amber-400 to-orange-500 px-9 py-4 text-base font-bold text-slate-950 shadow-xl shadow-orange-950/30 transition hover:from-yellow-200 hover:via-amber-300 hover:to-orange-400 focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:outline-none"
                            >
                                Get started <FaArrowRight />
                            </button>
                        </section>
                    ) : (
                        <section className="mx-auto w-full max-w-3xl rounded-3xl border border-amber-300/20 bg-slate-900/75 p-5 shadow-2xl shadow-orange-950/15 backdrop-blur sm:p-7">
                            <div className="text-center">
                                <h1 className="text-3xl font-semibold text-white">Help improve Sourccey</h1>
                                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
                                    Contribute product and robot data so we can improve reliability and robot support.
                                </p>
                            </div>

                            <div className="mt-5 grid gap-3">
                                <div
                                    className={`w-full rounded-2xl border p-5 text-left transition ${
                                        productImprovementEnabled
                                            ? 'border-orange-300/45 bg-linear-to-br from-amber-300/10 to-orange-400/5 shadow-lg shadow-orange-950/10'
                                            : 'border-amber-200/15 bg-slate-950/35'
                                    }`}
                                >
                                    <span className="flex items-center justify-between gap-5">
                                        <span className="text-sm font-semibold text-white">Share improvement data</span>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={productImprovementEnabled}
                                            aria-label="Share diagnostics and dataset metadata"
                                            onClick={() =>
                                                setChoices((current) =>
                                                    applyProductImprovementChoice(current, !productImprovementEnabled)
                                                )
                                            }
                                            disabled={savePreferences.isPending}
                                            className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
                                                productImprovementEnabled
                                                    ? 'border-orange-300 bg-linear-to-r from-yellow-300 to-orange-400'
                                                    : 'border-slate-600 bg-slate-800'
                                            } disabled:cursor-not-allowed disabled:opacity-60`}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={`absolute top-1 h-5 w-5 rounded-full shadow transition-all ${
                                                    productImprovementEnabled ? 'left-6 bg-slate-950' : 'left-1 bg-slate-300'
                                                }`}
                                            />
                                        </button>
                                    </span>
                                    <span className="mt-2 block text-xs leading-5 text-slate-400">
                                        Share diagnostics and dataset metadata. No trajectories or vision data.
                                    </span>
                                </div>

                                <div
                                    className={`w-full rounded-2xl border p-5 text-left transition ${
                                        aiRecordingContributionEnabled
                                            ? 'border-orange-300/45 bg-linear-to-br from-amber-300/10 to-orange-400/5 shadow-lg shadow-orange-950/10'
                                            : 'border-amber-200/15 bg-slate-950/35'
                                    }`}
                                >
                                    <span className="flex items-center justify-between gap-5">
                                        <span className="text-sm font-semibold text-white">Contribute vision data</span>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={aiRecordingContributionEnabled}
                                            aria-label="Contribute trajectories and vision data"
                                            onClick={() =>
                                                setChoices((current) =>
                                                    applyAiRecordingContributionChoice(current, !aiRecordingContributionEnabled)
                                                )
                                            }
                                            disabled={savePreferences.isPending}
                                            className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
                                                aiRecordingContributionEnabled
                                                    ? 'border-orange-300 bg-linear-to-r from-yellow-300 to-orange-400'
                                                    : 'border-slate-600 bg-slate-800'
                                            } disabled:cursor-not-allowed disabled:opacity-60`}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={`absolute top-1 h-5 w-5 rounded-full shadow transition-all ${
                                                    aiRecordingContributionEnabled ? 'left-6 bg-slate-950' : 'left-1 bg-slate-300'
                                                }`}
                                            />
                                        </button>
                                    </span>
                                    <span className="mt-2 block text-xs leading-5 text-slate-400">
                                        Share project trajectories, images, and video to improve Sourccey's AI.
                                    </span>
                                </div>
                            </div>

                            <div className="mt-5 flex flex-col items-center border-t border-amber-200/10 pt-5">
                                <button
                                    type="button"
                                    onClick={() => void finishOnboarding()}
                                    disabled={savePreferences.isPending}
                                    className="inline-flex min-h-14 shrink-0 cursor-pointer items-center justify-center gap-3 rounded-2xl bg-linear-to-r from-yellow-300 via-amber-400 to-orange-500 px-9 py-4 text-base font-bold text-slate-950 shadow-xl shadow-orange-950/25 transition hover:from-yellow-200 hover:via-amber-300 hover:to-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {savePreferences.isPending ? 'Saving...' : 'Continue'}
                                    {!savePreferences.isPending && <FaArrowRight />}
                                </button>
                            </div>

                            {(error || savePreferences.error) && (
                                <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                                    Privacy preferences could not be saved. Please try again.
                                </div>
                            )}
                        </section>
                    )}
                </div>
            </main>
        </div>
    );
}
