'use client';

import { useEffect, useMemo, useState } from 'react';
import { FaArrowLeft, FaCheckCircle, FaGlobe, FaSpinner } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { LinkButton } from '@/components/Elements/Link/LinkButton';
import {
    saveDesktopEnvironmentSettings,
    useDesktopEnvironmentSettings,
} from '@/hooks/System/desktop-environment.hook';
import type {
    DesktopEnvironment,
    DesktopEnvironmentSettings,
} from '@/types/desktop-environment';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';

const environmentCards: Array<{
    value: DesktopEnvironment;
    title: string;
    description: string;
}> = [
    {
        value: 'production',
        title: 'Production',
        description: 'Connect this desktop app to the live Vulcan Studio cloud environment.',
    },
    {
        value: 'staging',
        title: 'Staging',
        description: 'Use staging services for pre-release validation and QA.',
    },
    {
        value: 'local',
        title: 'Developer',
        description: 'Point desktop traffic at local or custom Studio services during development.',
    },
];

export default function DesktopDeveloperSettingsPage() {
    const { data, isLoading, error } = useDesktopEnvironmentSettings();
    const [environment, setEnvironment] = useState<DesktopEnvironment>('production');
    const [customGraphqlApiUrl, setCustomGraphqlApiUrl] = useState('http://192.168.1.220:5200/v1/graphql');
    const [customStudioWebUrl, setCustomStudioWebUrl] = useState('http://192.168.1.220:3000');
    const [customUpdaterManifestUrl, setCustomUpdaterManifestUrl] = useState('http://192.168.1.220:3000/latest.json');
    const [resolvedSettings, setResolvedSettings] = useState<DesktopEnvironmentSettings | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const isDeveloperEnvironment = environment === 'local';

    useEffect(() => {
        if (!data) {
            return;
        }

        setEnvironment(data.environment);
        setCustomGraphqlApiUrl(data.customGraphqlApiUrl);
        setCustomStudioWebUrl(data.customStudioWebUrl);
        setCustomUpdaterManifestUrl(data.customUpdaterManifestUrl);
        setResolvedSettings(data);
    }, [data]);

    const previewSettings = useMemo<DesktopEnvironmentSettings | null>(() => {
        if (!resolvedSettings) {
            return null;
        }

        return {
            environment,
            displayName: environment === 'production' ? 'Production' : environment === 'staging' ? 'Staging' : 'Developer',
            badgeLabel: environment === 'production' ? null : environment === 'staging' ? 'STAGING' : 'DEV MODE',
            teleopLogLevel: resolvedSettings.teleopLogLevel,
            customGraphqlApiUrl,
            customStudioWebUrl,
            customUpdaterManifestUrl,
            graphqlApiUrl:
                environment === 'production'
                    ? 'https://api.studio.vulcanrobotics.ai/v1/graphql'
                    : environment === 'staging'
                      ? 'https://api.staging.factory.studio.vulcanrobotics.ai/v1/graphql'
                      : customGraphqlApiUrl,
            studioWebUrl:
                environment === 'production'
                    ? 'https://studio.vulcanrobotics.ai'
                    : environment === 'staging'
                      ? 'https://staging.factory.studio.vulcanrobotics.ai'
                      : customStudioWebUrl,
            updaterManifestUrl:
                environment === 'production'
                    ? 'https://sourccey.nyc3.cdn.digitaloceanspaces.com/updater/latest.json'
                    : environment === 'staging'
                      ? 'https://sourccey-staging.nyc3.cdn.digitaloceanspaces.com/updater/latest.json'
                      : customUpdaterManifestUrl,
        };
    }, [
        customGraphqlApiUrl,
        customStudioWebUrl,
        customUpdaterManifestUrl,
        environment,
        resolvedSettings,
    ]);

    const persistEnvironmentSettings = async (
        nextEnvironment: DesktopEnvironment,
        nextCustomGraphqlApiUrl = customGraphqlApiUrl,
        nextCustomStudioWebUrl = customStudioWebUrl,
        nextCustomUpdaterManifestUrl = customUpdaterManifestUrl
    ) => {
        setIsSaving(true);
        try {
            const saved = await saveDesktopEnvironmentSettings({
                environment: nextEnvironment,
                teleopLogLevel: resolvedSettings?.teleopLogLevel,
                customGraphqlApiUrl: nextCustomGraphqlApiUrl,
                customStudioWebUrl: nextCustomStudioWebUrl,
                customUpdaterManifestUrl: nextCustomUpdaterManifestUrl,
            });
            setResolvedSettings(saved);
            setEnvironment(saved.environment);
            setCustomGraphqlApiUrl(saved.customGraphqlApiUrl);
            setCustomStudioWebUrl(saved.customStudioWebUrl);
            setCustomUpdaterManifestUrl(saved.customUpdaterManifestUrl);
            toast.success(
                <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold">
                        <FaCheckCircle className="h-4 w-4 text-emerald-300" />
                        Desktop environment updated
                    </div>
                    <div className="text-sm text-slate-200">
                        Vulcan Studio now points at <span className="font-semibold text-white">{saved.displayName}</span>.
                    </div>
                </div>,
                { ...toastSuccessDefaults }
            );
        } catch (saveError) {
            console.error('Failed to save desktop environment settings:', saveError);
            toast.error(
                <div className="space-y-1">
                    <div className="font-semibold">Could not save developer settings</div>
                    <div className="text-sm text-slate-200">
                        {saveError instanceof Error ? saveError.message : 'Failed to save developer settings'}
                    </div>
                </div>,
                { ...toastErrorDefaults }
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleEnvironmentSelect = async (nextEnvironment: DesktopEnvironment) => {
        setEnvironment(nextEnvironment);
        await persistEnvironmentSettings(
            nextEnvironment,
            customGraphqlApiUrl,
            customStudioWebUrl,
            customUpdaterManifestUrl
        );
    };

    const handleDeveloperInputsBlur = async () => {
        if (!isDeveloperEnvironment) {
            return;
        }
        await persistEnvironmentSettings(
            'local',
            customGraphqlApiUrl,
            customStudioWebUrl,
            customUpdaterManifestUrl
        );
    };

    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto flex flex-col gap-8 px-8 py-8">
                <div>
                    <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Desktop Settings</div>
                    <h1 className="text-3xl font-semibold text-white">Developer Settings</h1>
                    <p className="mt-2 text-sm text-slate-300">
                        Switch Vulcan Studio between production, staging, and developer endpoints at runtime.
                    </p>
                    <div className="mt-4">
                        <LinkButton
                            href="/desktop/settings"
                            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
                        >
                            <FaArrowLeft className="h-4 w-4" />
                            Back to Settings
                        </LinkButton>
                    </div>
                </div>

                <div className="rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold text-white">Environment</h2>
                        <p className="mt-1 text-sm text-slate-400">
                            The selected environment controls GraphQL, Studio sign-in, and desktop app update checks.
                        </p>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                            <FaSpinner className="h-4 w-4 animate-spin" />
                            Loading developer settings...
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid gap-4 md:grid-cols-3">
                                {environmentCards.map((card) => {
                                    const active = environment === card.value;
                                    return (
                                        <button
                                            key={card.value}
                                            type="button"
                                            onClick={() => void handleEnvironmentSelect(card.value)}
                                            disabled={isSaving}
                                            className={`cursor-pointer rounded-xl border p-4 text-left transition ${
                                                active
                                                    ? 'border-amber-400/60 bg-amber-500/10 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]'
                                                    : 'border-slate-600 bg-slate-700/40 hover:border-slate-500 hover:bg-slate-700/60'
                                            } disabled:cursor-not-allowed disabled:opacity-60`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="text-lg font-semibold text-white">{card.title}</div>
                                                {active ? <FaCheckCircle className="h-4 w-4 text-amber-300" /> : null}
                                            </div>
                                            <p className="mt-2 text-sm text-slate-300">{card.description}</p>
                                        </button>
                                    );
                                })}
                            </div>

                            {isDeveloperEnvironment ? (
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                                        <label htmlFor="custom-graphql-api-url" className="mb-2 block text-sm font-medium text-slate-300">
                                            GraphQL API URL
                                        </label>
                                        <input
                                            id="custom-graphql-api-url"
                                            type="text"
                                            value={customGraphqlApiUrl}
                                            onChange={(event) => setCustomGraphqlApiUrl(event.target.value)}
                                            onBlur={() => void handleDeveloperInputsBlur()}
                                            disabled={isSaving}
                                            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                        <p className="mt-2 flex items-start gap-2 text-xs text-slate-400">
                                            <FaGlobe className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
                                            Used for desktop GraphQL requests after sign-in.
                                        </p>
                                    </div>

                                    <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                                        <label htmlFor="custom-studio-web-url" className="mb-2 block text-sm font-medium text-slate-300">
                                            Studio Web URL
                                        </label>
                                        <input
                                            id="custom-studio-web-url"
                                            type="text"
                                            value={customStudioWebUrl}
                                            onChange={(event) => setCustomStudioWebUrl(event.target.value)}
                                            onBlur={() => void handleDeveloperInputsBlur()}
                                            disabled={isSaving}
                                            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                        <p className="mt-2 flex items-start gap-2 text-xs text-slate-400">
                                            <FaGlobe className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
                                            Used for Studio credential login through the website proxy.
                                        </p>
                                    </div>

                                    <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-4 md:col-span-2">
                                        <label
                                            htmlFor="custom-updater-manifest-url"
                                            className="mb-2 block text-sm font-medium text-slate-300"
                                        >
                                            Updater Manifest URL
                                        </label>
                                        <input
                                            id="custom-updater-manifest-url"
                                            type="text"
                                            value={customUpdaterManifestUrl}
                                            onChange={(event) => setCustomUpdaterManifestUrl(event.target.value)}
                                            onBlur={() => void handleDeveloperInputsBlur()}
                                            disabled={isSaving}
                                            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                    </div>
                                </div>
                            ) : null}

                            <div className="grid gap-4 rounded-xl border border-slate-700 bg-slate-900/40 p-4 md:grid-cols-2">
                                <div>
                                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">GraphQL API</div>
                                    <div className="mt-2 break-all text-sm text-white">{previewSettings?.graphqlApiUrl ?? '...'}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Studio Website</div>
                                    <div className="mt-2 break-all text-sm text-white">{previewSettings?.studioWebUrl ?? '...'}</div>
                                </div>
                                <div className="md:col-span-2">
                                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Updater Manifest</div>
                                    <div className="mt-2 break-all text-sm text-white">{previewSettings?.updaterManifestUrl ?? '...'}</div>
                                </div>
                            </div>

                            {error ? <div className="text-sm text-red-300">Failed to load environment settings.</div> : null}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
