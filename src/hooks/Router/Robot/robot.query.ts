import { useCallback } from 'react';
import { setQueryParams, useQueryValue } from '@/hooks/Router/useQueryRouter';

export function useQueryRouter() {
    const view = useQueryValue('view') || 'robots';
    const id = useQueryValue('id') || '';

    const gotoList = useCallback(() => {
        setQueryParams({ view: 'robots', id: null });
    }, []);

    const gotoDetails = useCallback((robotId: string, replace = false) => {
        setQueryParams({ view: 'robot', id: robotId }, { replace });
    }, []);

    return { view, id, gotoList, gotoDetails };
}
