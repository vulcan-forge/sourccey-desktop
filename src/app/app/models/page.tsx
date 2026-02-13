'use client';

import { usePairedRobotConnections } from '@/hooks/Robot/paired-robot-connection.hook';
import { useRobotConnectionStatuses } from '@/hooks/Robot/robot-connection-status.hook';
import { useSelectedRobot } from '@/hooks/Robot/selected-robot.hook';
import { setSelectedModel, useSelectedModel } from '@/hooks/Model/selected-model.hook';
import { invoke } from '@tauri-apps/api/core';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';

type ModelCard = {
    id: string;
    repoId: string;
    name: string;
    image: string;
    rating: string;
    strength: string;
    clothingTypes: string;
};

const FREE_MODELS: ModelCard[] = [
    {
        id: 'free-1',
        repoId: 'sourccey/free',
        name: 'Starter Fit',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.3',
        strength: 'Balanced',
        clothingTypes: 'Shirt, Jeans, Shorts',
    },
    {
        id: 'free-2',
        repoId: 'sourccey/free',
        name: 'Quick Match',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.1',
        strength: 'Fast',
        clothingTypes: 'Casual, Sport',
    },
    {
        id: 'free-3',
        repoId: 'sourccey/free',
        name: 'Daily Wear',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.5',
        strength: 'Comfort',
        clothingTypes: 'Daily, Lounge',
    },
    {
        id: 'free-4',
        repoId: 'sourccey/free',
        name: 'Core Mix',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.0',
        strength: 'Versatile',
        clothingTypes: 'Basics, Denim',
    },
    {
        id: 'free-5',
        repoId: 'sourccey/free',
        name: 'Street Lite',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.2',
        strength: 'Everyday',
        clothingTypes: 'Streetwear, Casual',
    },
    {
        id: 'free-6',
        repoId: 'sourccey/free',
        name: 'Neutral Set',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.1',
        strength: 'Color Match',
        clothingTypes: 'Neutral, Basics',
    },
    {
        id: 'free-7',
        repoId: 'sourccey/free',
        name: 'Comfy Flex',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.4',
        strength: 'Comfort',
        clothingTypes: 'Lounge, Knit',
    },
    {
        id: 'free-8',
        repoId: 'sourccey/free',
        name: 'Urban Pair',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.0',
        strength: 'Mix & Match',
        clothingTypes: 'Denim, Layers',
    },
    {
        id: 'free-9',
        repoId: 'sourccey/free',
        name: 'Weekend Go',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.2',
        strength: 'Quick Picks',
        clothingTypes: 'Travel, Casual',
    },
    {
        id: 'free-10',
        repoId: 'sourccey/free',
        name: 'Clean Cut',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.3',
        strength: 'Sharp Looks',
        clothingTypes: 'Smart Casual',
    },
];

const PAID_MODELS: ModelCard[] = [
    {
        id: 'paid-1',
        repoId: 'sourccey/premium',
        name: 'Premium Stylist',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.8',
        strength: 'High Accuracy',
        clothingTypes: 'Formal, Designer',
    },
    {
        id: 'paid-2',
        repoId: 'sourccey/premium',
        name: 'Runway Pro',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.9',
        strength: 'Trend Focus',
        clothingTypes: 'Luxury, Seasonal',
    },
    {
        id: 'paid-3',
        repoId: 'sourccey/premium',
        name: 'Fit Master',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.7',
        strength: 'Sizing',
        clothingTypes: 'Athletic, Outerwear',
    },
    {
        id: 'paid-4',
        repoId: 'sourccey/premium',
        name: 'Studio Elite',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.8',
        strength: 'Detail',
        clothingTypes: 'Collections, Premium',
    },
    {
        id: 'paid-5',
        repoId: 'sourccey/premium',
        name: 'Executive Edge',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.9',
        strength: 'Formal Fit',
        clothingTypes: 'Suiting, Tailored',
    },
    {
        id: 'paid-6',
        repoId: 'sourccey/premium',
        name: 'Season Curator',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.7',
        strength: 'Seasonal Looks',
        clothingTypes: 'Winter, Summer',
    },
    {
        id: 'paid-7',
        repoId: 'sourccey/premium',
        name: 'Luxury Blend',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.8',
        strength: 'High-End',
        clothingTypes: 'Designer, Premium',
    },
    {
        id: 'paid-8',
        repoId: 'sourccey/premium',
        name: 'Precision Fit',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.8',
        strength: 'Body Match',
        clothingTypes: 'Athletic, Formal',
    },
    {
        id: 'paid-9',
        repoId: 'sourccey/premium',
        name: 'Trend Engine',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.9',
        strength: 'Fashion Trends',
        clothingTypes: 'Runway, Seasonal',
    },
    {
        id: 'paid-10',
        repoId: 'sourccey/premium',
        name: 'Signature Studio',
        image: '/assets/logo/SourcceyLogo.png',
        rating: '4.7',
        strength: 'Personalization',
        clothingTypes: 'Capsule, Custom',
    },
];

export default function ModelsPage() {
    const [activeTab, setActiveTab] = useState<'free' | 'premium'>('free');
    const models = useMemo(() => (activeTab === 'free' ? FREE_MODELS : PAID_MODELS), [activeTab]);
    const { data: selectedModel } = useSelectedModel();
    const { data: selectedRobot } = useSelectedRobot();
    const { data: pairedConnections } = usePairedRobotConnections();
    const { data: connectionStatuses } = useRobotConnectionStatuses();
    const [isSendingModel, setIsSendingModel] = useState(false);
    const getErrorMessage = (error: unknown) => {
        if (typeof error === 'string') return error;
        if (error && typeof error === 'object') {
            const maybeMessage = (error as { message?: string }).message;
            if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
        }
        return 'Failed to send model to robot.';
    };

    const selectedRobotNickname = selectedRobot?.nickname || '';
    const selectedConnection = selectedRobotNickname ? pairedConnections?.[selectedRobotNickname] : null;
    const isRobotConnected = !!(selectedRobotNickname && connectionStatuses?.[selectedRobotNickname]?.connected);

    const handleSendToRobot = async () => {
        if (!selectedModel) {
            toast.error('Select an AI model first.', { ...toastErrorDefaults });
            return;
        }
        if (!selectedRobotNickname) {
            toast.error('Select a robot first from the Robots page.', { ...toastErrorDefaults });
            return;
        }
        if (!selectedConnection) {
            toast.error('Selected robot is not paired yet. Pair it from the Robots page.', { ...toastErrorDefaults });
            return;
        }
        if (!isRobotConnected) {
            toast.error('Selected robot is not connected. Press Connect from the Robots page first.', { ...toastErrorDefaults });
            return;
        }

        setIsSendingModel(true);
        try {
            const message = await invoke<string>('send_model_to_kiosk_robot', {
                host: selectedConnection.host,
                port: selectedConnection.port,
                token: selectedConnection.token,
                repoId: selectedModel.repoId,
                modelName: selectedModel.name,
            });
            toast.success(message || 'Model sent to robot.', { ...toastSuccessDefaults });
        } catch (error: unknown) {
            toast.error(getErrorMessage(error), { ...toastErrorDefaults });
        } finally {
            setIsSendingModel(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900/30 p-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">AI Models</h1>
                    <p className="mt-2 text-slate-300">Choose from free and paid AI model sets.</p>
                </div>

                <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/80 p-1">
                    <button
                        onClick={() => setActiveTab('free')}
                        className={`rounded-lg px-6 py-2 text-sm font-semibold transition-all ${
                            activeTab === 'free' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700/80'
                        }`}
                    >
                        Free
                    </button>
                    <button
                        onClick={() => setActiveTab('premium')}
                        className={`rounded-lg px-6 py-2 text-sm font-semibold transition-all ${
                            activeTab === 'premium' ? 'bg-yellow-500 text-white' : 'text-slate-300 hover:bg-slate-700/80'
                        }`}
                    >
                        Premium
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={handleSendToRobot}
                        disabled={!selectedModel || !selectedConnection || !isRobotConnected || isSendingModel}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                            !selectedModel || !selectedConnection || !isRobotConnected || isSendingModel
                                ? 'cursor-not-allowed bg-gray-500 text-gray-300 opacity-60'
                                : 'cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                    >
                        {isSendingModel ? 'Sending...' : 'Send Selected Model To Robot'}
                    </button>
                    <span className="text-sm text-slate-400">
                        Robot: {selectedRobot?.name || 'None'} | Connection: {isRobotConnected ? 'Connected' : 'Not connected'} | Model:{' '}
                        {selectedModel?.name || 'None'}
                    </span>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                    {models.map((model) => (
                        <button
                            key={model.id}
                            type="button"
                            onClick={() =>
                                setSelectedModel({
                                    id: model.id,
                                    repoId: model.repoId,
                                    name: model.name,
                                    tier: activeTab,
                                    rating: model.rating,
                                    strength: model.strength,
                                    clothingTypes: model.clothingTypes,
                                    image: model.image,
                                })
                            }
                            className={`w-full cursor-pointer overflow-hidden rounded-2xl border bg-slate-800 text-left transition-all duration-200 hover:scale-[1.02] ${
                                selectedModel?.id === model.id && selectedModel?.tier === activeTab
                                    ? 'border-yellow-400/70 shadow-lg shadow-yellow-500/10'
                                    : 'border-slate-700'
                            }`}
                        >
                            <div className="p-3">
                                <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-slate-600 bg-slate-750">
                                    <Image
                                        src={model.image}
                                        alt={model.name}
                                        fill
                                        className="object-cover"
                                        sizes="(max-width: 640px) 100vw, 25vw"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2 p-4">
                                <div className="text-lg font-semibold text-white">{model.name}</div>
                                <div className="text-sm text-slate-300">
                                    <span className="font-semibold text-slate-200">Rating:</span> {model.rating}
                                </div>
                                <div className="text-sm text-slate-300">
                                    <span className="font-semibold text-slate-200">Strength:</span> {model.strength}
                                </div>
                                <div className="text-sm text-slate-300">
                                    <span className="font-semibold text-slate-200">Clothing Types:</span> {model.clothingTypes}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
