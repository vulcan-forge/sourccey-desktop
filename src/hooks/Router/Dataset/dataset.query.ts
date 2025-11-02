import { useCallback } from 'react';
import { setQueryParams, useQueryValue } from '@/hooks/Router/useQueryRouter';

export function useDatasetQueryRouter() {
    const view = useQueryValue('view') || 'datasets';
    const nickname = useQueryValue('nickname') || '';
    const dataset = useQueryValue('dataset') || '';

    const gotoList = useCallback(() => {
        setQueryParams({ view: 'datasets', nickname: null, dataset: null });
    }, []);

    const gotoDetails = useCallback((nickname: string, dataset: string, replace = false) => {
        setQueryParams({ view: 'datasets', nickname: nickname, dataset: dataset }, { replace });
    }, []);

    return { view, nickname, dataset, gotoList, gotoDetails };
}
