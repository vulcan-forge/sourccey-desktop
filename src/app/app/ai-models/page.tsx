'use client';

import { AIModelsListPage } from '@/app/app/ai-models/AIModelsListPage';
import { AIModelDetailPage } from '@/app/app/ai-models/AIModelsDetailPage';
import { useAIModelQueryRouter } from '@/hooks/Router/AIModels/ai-models.query';

export default function AIModelsPage() {
    const { repo_id, name }: any = useAIModelQueryRouter();
    return repo_id && name ? <AIModelDetailPage repo_id={repo_id} name={name} /> : <AIModelsListPage />;
}
