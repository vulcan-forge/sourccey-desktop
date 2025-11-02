import { useCallback } from 'react';
import { setQueryParams, useQueryValue } from '@/hooks/Router/useQueryRouter';

export function useAIModelQueryRouter() {
    const view = useQueryValue('view') || 'ai-models';
    const repo_id = useQueryValue('repo_id') || '';
    const name = useQueryValue('name') || '';

    const gotoList = useCallback(() => {
        setQueryParams({ view: 'ai-models', repo_id: null, name: null });
    }, []);

    const gotoDetails = useCallback((repo_id: string, name: string, replace = false) => {
        setQueryParams({ view: 'ai-models', repo_id: repo_id, name: name }, { replace });
    }, []);

    return { view, repo_id, name, gotoList, gotoDetails };
}
