'use client';

import { useGetAIModel } from '@/hooks/Components/AI/AIModels/ai-model.hook';
import { useState } from 'react';
import { AIModelNavbar } from '@/components/Layouts/Navbar/AIModel/AIModelNavbar';
import { AIModelEvaluate } from '@/components/PageComponents/AIModels/AIModelEvaluate';
import { AIModelDetailsPanel } from '@/components/Elements/AI/AIModels/AIModelDetailsPanel';

export const AIModelDetailPage = ({ repo_id, name }: { repo_id: string; name: string }) => {
    // Fetch the model by name (nickname)
    const { data, isLoading, error }: any = useGetAIModel(repo_id, name);
    const model = data || null;

    const [activeTab, setActiveTab] = useState<'overview' | 'evaluate' | 'inference'>('overview');

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="text-center">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500"></div>
                    <p className="mt-4 text-slate-400">Loading AI model...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="text-center">
                    <p className="text-lg text-red-400">Error loading AI model</p>
                    <p className="mt-2 text-slate-400">{error.message}</p>
                </div>
            </div>
        );
    }

    if (!model) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="text-center">
                    <p className="text-lg text-slate-400">AI Model not found</p>
                    <p className="mt-2 text-slate-500">The AI model &quot;{name}&quot; could not be found.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900">
            <AIModelNavbar activeTab={activeTab} setActiveTab={(tab: string) => setActiveTab(tab as 'overview' | 'evaluate' | 'inference')} />

            {/* Content */}
            <div className="mx-auto max-w-7xl px-6 py-6">
                {activeTab === 'overview' && <AIModelDetailsPanel model={model} />}
                {activeTab === 'evaluate' && <AIModelEvaluate model={model} isLoading={isLoading} />}
            </div>
        </div>
    );
};
