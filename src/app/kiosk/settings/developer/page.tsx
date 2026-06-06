'use client';

import { useEffect, useState } from 'react';
import { FaArrowLeft, FaCheckCircle, FaCodeBranch, FaGlobe, FaSave, FaSpinner } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { LinkButton } from '@/components/Elements/Link/LinkButton';
import {
    saveKioskEnvironmentSettings,
    useKioskEnvironmentSettings,
} from '@/hooks/System/kiosk-environment.hook';
import type { KioskEnvironment, KioskEnvironmentSettings } from '@/types/kiosk-environment';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';

const environmentCards: Array<{
    value: KioskEnvironment;
    title: string;
    description: string;
}> = [
    {
        value: 'production',
        title: 'Production',
        description: 'Connect this kiosk to the live Vulcan Studio environment.',
    },
    {
        value: 'staging',
        title: 'Staging',
        description: 'Use the staging environment for pre-release validation.',
    },
    {
        value: 'local',
        title: 'Local / Custom',
        description: 'Point the kiosk at a local or custom host for development.',
    },
];

export default function KioskDeveloperSettingsPage() {
    const { data, isLoading, error } = useKioskEnvironmentSettings();
    const [environment, setEnvironment] = useState<KioskEnvironment>('local');
    const [customAppBaseUrl, setCustomAppBaseUrl] = useState('http://192.168.1.220:3000');
    const [customApiBaseUrl, setCustomApiBaseUrl] = useState('http://192.168.1.220:5200');
    const [resolvedSettings, setResolvedSettings] = useState<KioskEnvironmentSettings | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const isLocalEnvironment = environment === 'local';

    useEffect(() => {
        if (!data) {
            return;
        }

        setEnvironment(data.environment);
        setCustomAppBaseUrl(data.customAppBaseUrl);
        setCustomApiBaseUrl(data.customApiBaseUrl);
        setResolvedSettings(data);
    }, [data]);

    const applyLocalDraft = () => {
        const normalizedApp = customAppBaseUrl.trim();
        const normalizedApi = customApiBaseUrl.trim();
        const appBase = normalizedApp.length > 0 ? normalizedApp : 'http://192.168.1.220:3000';
        const apiBase = normalizedApi.length > 0 ? normalizedApi : 'http://192.168.1.220:5200';
        setResolvedSettings({
            environment,
            displayName:
                environment === 'production' ? 'Production' : environment === 'staging' ? 'Staging' : 'Local',
            badgeLabel: environment === 'production' ? null : environment === 'staging' ? 'Staging' : 'Local',
            customAppBaseUrl: appBase,
            customApiBaseUrl: apiBase,
            appBaseUrl:
                environment === 'production'
                    ? 'https://studio.vulcanrobotics.ai'
                    : environment === 'staging'
                      ? 'https://staging.factory.studio.vulcanrobotics.ai'
                      : appBase,
            apiBaseUrl:
                environment === 'production'
                    ? 'https://api.studio.vulcanrobotics.ai'
                    : environment === 'staging'
                      ? 'https://api.staging.factory.studio.vulcanrobotics.ai'
                      : apiBase,
        });
    };

    useEffect(() => {
        applyLocalDraft();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [environment, customAppBaseUrl, customApiBaseUrl]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const saved = await saveKioskEnvironmentSettings({
                environment,
                customAppBaseUrl,
                customApiBaseUrl,
            });
            setResolvedSettings(saved);
            setEnvironment(saved.environment);
            setCustomAppBaseUrl(saved.customAppBaseUrl);
            setCustomApiBaseUrl(saved.customApiBaseUrl);
            toast.success(
                <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold">
                        <FaCheckCircle className="h-4 w-4 text-emerald-300" />
                        Environment updated
                    </div>
                    <div className="text-sm text-slate-200">
                        Pairing state and websocket credentials will now follow{' '}
                        <span className="font-semibold text-white">{saved.displayName}</span>.
                    </div>
                </div>,
                { ...toastSuccessDefaults }
            );
        } catch (saveError) {
            console.error('Failed to save kiosk environment settings:', saveError);
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

    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto flex flex-col gap-8 px-8 py-8">
                <div>
                    <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Kiosk Settings</div>
                    <h1 className="text-3xl font-semibold text-white">Developer Settings</h1>
                    <p className="mt-2 text-sm text-slate-300">
                        Switch this robot between production, staging, and local Vulcan environments.
                    </p>
                    <div className="mt-4">
                        <LinkButton
                            href="/kiosk/settings"
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
                            The selected environment controls cloud registration, API calls, and websocket relay defaults.
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
                                            onClick={() => setEnvironment(card.value)}
                                            className={`cursor-pointer rounded-xl border p-4 text-left transition ${
                                                active
                                                    ? 'border-amber-400/60 bg-amber-500/10 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]'
                                                    : 'border-slate-600 bg-slate-700/40 hover:border-slate-500 hover:bg-slate-700/60'
                                            }`}
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

                            {isLocalEnvironment ? (
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                                        <label htmlFor="custom-app-base-url" className="mb-2 block text-sm font-medium text-slate-300">
                                            Local Portal URL
                                        </label>
                                        <input
                                            id="custom-app-base-url"
                                            type="text"
                                            value={customAppBaseUrl}
                                            onChange={(event) => setCustomAppBaseUrl(event.target.value)}
                                            placeholder="192.168.1.220:3000 or http://192.168.1.220:3000"
                                            disabled={isSaving}
                                            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                        <p className="mt-2 flex items-start gap-2 text-xs text-slate-400">
                                            <FaGlobe className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
                                            This is the local website users open to enter the pairing code.
                                        </p>
                                    </div>

                                    <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-4">
                                        <label htmlFor="custom-api-base-url" className="mb-2 block text-sm font-medium text-slate-300">
                                            Local API URL
                                        </label>
                                        <input
                                            id="custom-api-base-url"
                                            type="text"
                                            value={customApiBaseUrl}
                                            onChange={(event) => setCustomApiBaseUrl(event.target.value)}
                                            placeholder="192.168.1.220:5200 or http://192.168.1.220:5200"
                                            disabled={isSaving}
                                            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                        <p className="mt-2 flex items-start gap-2 text-xs text-slate-400">
                                            <FaCodeBranch className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
                                            This powers pairing, session lookup, and the credential file used by the websocket relay.
                                        </p>
                                    </div>
                                </div>
                            ) : null}

                            <div className="grid gap-4 rounded-xl border border-slate-700 bg-slate-900/40 p-4 md:grid-cols-2">
                                <div>
                                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
                                        {isLocalEnvironment ? 'Portal URL' : 'App URL'}
                                    </div>
                                    <div className="mt-2 break-all text-sm text-white">{resolvedSettings?.appBaseUrl ?? '...'}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">API URL</div>
                                    <div className="mt-2 break-all text-sm text-white">{resolvedSettings?.apiBaseUrl ?? '...'}</div>
                                </div>
                            </div>

                            {error ? <div className="text-sm text-red-300">Failed to load environment settings.</div> : null}

                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => void handleSave()}
                                    disabled={isSaving}
                                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSaving ? <FaSpinner className="h-4 w-4 animate-spin" /> : <FaSave className="h-4 w-4" />}
                                    {isSaving ? 'Saving...' : 'Save Environment'}
                                </button>
                                <span className="text-xs text-slate-400">
                                    Saving updates the kiosk environment that the backend uses when it writes pairing state and websocket credential files.
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
