'use client';

import { AIModelsContainer } from '@/components/PageComponents/Models/AIModelsContainer';

export default function ModelsPage() {
    return (
        <div className="min-h-screen bg-slate-900/30 p-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">AI Models</h1>
                    <p className="mt-2 text-slate-300">Browse and run locally cached models.</p>
                </div>
                <AIModelsContainer />
            </div>
        </div>
    );
}
